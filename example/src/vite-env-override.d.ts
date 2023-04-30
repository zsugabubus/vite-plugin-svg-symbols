declare module '*.svg?component' {
	declare const Component = (props: object) => string;
	export default Component;
}
