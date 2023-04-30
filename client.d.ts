type SVGSymbolProps = {
	url: string;
	viewBox: string;
};

declare module '*.svg' {
	declare const src: SVGSymbolProps;
	export default src;
}

declare module '*.svg?sprite' {
	declare const src: SVGSymbolProps;
	export default src;
}

declare module 'virtual:svg-symbols' {
	export type { SVGSymbolProps };
}
