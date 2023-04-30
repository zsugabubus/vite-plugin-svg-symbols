// Helper module to inject HMR code.
import 'virtual:svg-symbols';

import '@/style.css';
import logo from '@/vite.svg?sprite';
import logoComponent from '@/vite.svg?component';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
	<svg viewBox="${logo.viewBox}" class="logo">
		<use href="${logo.url}" />
	</svg>
	${logoComponent({
		className: 'logo',
	})}
`;
