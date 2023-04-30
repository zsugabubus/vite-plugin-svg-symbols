import type { SVGSymbolProps } from 'virtual:svg-symbols';

export const Component = ({
	className,
	src: { viewBox, url },
}: {
	className?: string;
	src: SVGSymbolProps;
}) => `
	<svg viewBox="${viewBox}" class="${className ?? ''}">
		<use href="${url}" />
	</svg>
`;
