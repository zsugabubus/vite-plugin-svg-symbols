import { defineConfig } from 'vite';
import { svgSymbolsPlugin } from 'vite-plugin-svg-symbols';
import { resolve } from 'node:path';

export default defineConfig({
	assetsInclude: [],
	plugins: [
		{
			name: 'svg-sprite:component',
			enforce: 'pre',
			resolveId(source) {
				if (source.endsWith('.svg?component')) return source;
				return null;
			},
			load(id) {
				if (!id.endsWith('.svg?component')) return null;
				const source = id.slice(0, -'?component'.length);

				return `
					import { Component as Base } from '@/component.ts';
					import src from ${JSON.stringify(source + '?sprite')};
					const Component = (props) => Base({ ...props, src });
					export default Component;
				`;
			},
		},
		svgSymbolsPlugin({
			include: '**/*.svg?sprite',
			svgoConfig: (config) => ({
				...config,
				plugins: [
					...config.plugins,
					{
						name: 'removeAttrs',
						params: {
							attrs: 'class',
						},
					},
				],
			}),
		}),
	],
	resolve: {
		alias: {
			'@': resolve(__dirname, 'src'),
		},
	},
});
