import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createFilter } from '@rollup/pluginutils';

import { Config, optimize } from 'svgo';
import type { PluginOption, ResolvedConfig, ViteDevServer } from 'vite';

export type SVGXpriteOptions = {
	include?: string;
	exclude?: string;

	/**
	 * Custom symbol@id.
	 *
	 * It accepts the following replacements:
	 * - `[hash]` - Content hash.
	 *
	 * @default 'svg-[hash]'.
	 */
	symbolId?: string;

	/**
	 * Inline <svg> attributes to use.
	 */
	svgAttrs?: Record<string, string>;

	/**
	 * SVGO config transformer.
	 */
	svgoConfig?: (config: Config) => Config;

	/**
	 * Inline generated <svg> to index.html.
	 *
	 * @default true
	 */
	inline?: boolean;
	injectTo?: undefined;
	fileName?: undefined;
} & (
	| {
			inline?: true;
			/**
			 * Where to inject <svg>.
			 *
			 * @default 'body' (end of <body>)
			 */
			injectTo?: 'body' | 'body-prepend';
	  }
	| {
			inline: false;
			/**
			 * Output asset name.
			 *
			 * @default 'symbols.svg'
			 */
			fileName?: string;
	  }
);

export const svgSymbolsPlugin = (
	options: SVGXpriteOptions = {},
): PluginOption => {
	const {
		symbolId = 'svg-[hash]',
		injectTo = 'body',
		fileName = 'symbols.svg',
		// https://a11y-guidelines.orange.com/en/articles/accessible-svg/
		svgAttrs = {
			'aria-hidden': 'true',
			focusable: 'false',
		},
		inline = true,
		svgoConfig = (config) => config,
		include = '**/*.svg',
		exclude,
	} = options;

	const virtualModuleId = 'virtual:svg-symbols';
	const resolvedVirtualModuleId = '\0' + virtualModuleId;

	const hmrUpdateEvent = `svg-symbols:update`;
	const hmrConnectionEvent = `svg-symbols:connection`;

	let loadedSymbols: Map<
		string,
		{
			symbolId: string;
			html: string;
		}
	>;
	let config: ResolvedConfig;
	let server: ViteDevServer;
	let outputInline: boolean;
	let outputFileName: string;

	const getSVGContent = () => {
		const defs = [...loadedSymbols.values()].map((x) => x.html).join('');
		const svgContent = `<defs>${defs}</defs>`;
		return svgContent;
	};

	const filter = createFilter(include, exclude);

	return {
		name: 'svg-symbols',

		enforce: 'pre',

		buildStart() {
			loadedSymbols = new Map();
		},

		configResolved(_config) {
			config = _config;
			outputFileName = `${config.build.assetsDir}/${fileName}`;
			outputInline = inline || config.env.DEV;
		},

		configureServer(_server) {
			server = _server;
			// 'connection' event cannot be used because our client-side handler
			// maybe not installed at that time.
			server.ws.on(hmrConnectionEvent, () => {
				server.ws.send(hmrUpdateEvent, [...loadedSymbols.values()]);
			});
		},

		resolveId(source) {
			if (filter(source)) return source;
			if (source === virtualModuleId) return resolvedVirtualModuleId;
			return null;
		},

		load: {
			order: 'pre',
			async handler(id) {
				if (id === resolvedVirtualModuleId)
					return `
if (import.meta.hot) {
	import.meta.hot.on(${JSON.stringify(hmrUpdateEvent)}, (data) => {
		const svgDefs = document.querySelector('body > svg > defs');
		console.assert(svgDefs);
		for (const meta of data) {
			const symbol = document.getElementById(meta.symbolId);
			if (symbol) {
				console.assert(svgDefs.contains(symbol));
				symbol.remove();
			}
			svgDefs.insertAdjacentHTML('beforeend', meta.html);
		}
	});
	import.meta.hot.send(${JSON.stringify(hmrConnectionEvent)});
}
	`;

				if (!filter(id)) return null;
				const source = id;

				const svgString = await readFile(cleanUrl(source), {
					encoding: 'utf8',
				});

				const { data: optimizedSvg } = optimize(
					svgString,
					svgoConfig({
						path: source,
						multipass: !config.env.DEV,
						plugins: [
							'preset-default',
							'removeXMLNS', // Unneeded for inline SVG.
							'convertStyleToAttrs',
							'removeDimensions', // @width + @height -> @viewBox
							{
								name: 'prefixIds',
								params: {
									prefix: getHash(svgString),
								},
							},
						],
					}),
				);

				const parts = optimizedSvg.match(
					/^<svg(?<attrs>[^>]*)>(?<content>.*)<\/svg>$/m,
				);
				if (parts === null) {
					return this.error(
						`${source} contains invalid data: Expected "<svg>...</svg>", got "${optimizedSvg}"`,
					);
				}
				const content = parts.groups!.content!;
				const attrs = parts.groups!.attrs!;

				const viewBoxMatch = attrs.match(/ viewBox="([^"]*)"/);
				if (viewBoxMatch === null) {
					return this.error(
						`${source} misses viewBox (or width/height) attributes`,
					);
				}
				const viewBox = viewBoxMatch[1]!;

				const hash = getHash(optimizedSvg);

				const outputId = symbolId.replaceAll('[hash]', hash);
				const outputURL = `${
					outputInline ? '' : '/' + outputFileName
				}#${outputId}`;

				const meta = {
					symbolId: outputId,
					html: `<symbol id="${outputId}"${attrs}>${content}</symbol>`,
				};
				loadedSymbols.set(meta.symbolId, meta);
				server.ws.send(hmrUpdateEvent, [meta]);

				return `export default ${JSON.stringify({
					url: outputURL,
					viewBox,
				})}`;
			},
		},

		generateBundle() {
			if (outputInline) return;

			this.emitFile({
				type: 'asset',
				name: 'symbols',
				needsCodeReference: false,
				fileName: outputFileName,
				source: `<svg xmlns="http://www.w3.org/2000/svg">${getSVGContent()}</svg>`,
			});
		},

		transformIndexHtml: {
			order: 'post',
			handler(html) {
				if (!outputInline) return;

				return {
					html,
					tags: [
						{
							tag: 'svg',
							attrs: svgAttrs,
							children: getSVGContent(),
							injectTo,
						},
					],
				};
			},
		},
	};
};

// Copy-pasted from Vite.
const getHash = (text: Buffer | string) =>
	createHash('sha256').update(text).digest('hex').substring(0, 8);

const postfixRE = /[?#].*$/s;
const cleanUrl = (url: string) => url.replace(postfixRE, '');
