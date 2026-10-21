const paths={
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 play:'<path d="M3 21 7 4h10l4 17M5 13h14M12 4v9M7 4 4 1m13 3 3-3M9 13v5h6v-5"/>',
 family:'<circle cx="8" cy="6" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 21v-5a6 6 0 0 1 12 0v5m1-8a5 5 0 0 1 7 4v4"/>',
 wc:'<path d="M5 3h14v18H5zM10 3v18m4-10v3"/>',
 water:'<path d="M3 15c3-3 3 3 6 0s3 3 6 0 3 3 6 0M3 20c3-3 3 3 6 0s3 3 6 0 3 3 6 0M7 10V4a2 2 0 0 1 4 0m3 9V4a2 2 0 0 1 4 0M7 6h7m-7 4h7"/>',
 book:'<path d="M12 5c-4-3-7-3-10-2v16c4-1 7 0 10 2 3-2 6-3 10-2V3c-3-1-6-1-10 2Zm0 0v16"/>',
 sport:'<circle cx="12" cy="12" r="9"/><path d="m8 5 4 4 5-3M3 12l6 1 2 7m9-9-5 3-4-5-3 4m7 1 2 5"/>',
 wifi:'<path d="M2 7a16 16 0 0 1 20 0M5 11a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0"/><circle cx="12" cy="19" r="1"/>',
 recycle:'<path d="m9 5 3-3 5 8m-2-1 2 1 1-3M18 13l4 7H12m2-2-2 2 2 2M8 20H2l5-9m-3 1 3-1 1 3"/>',
 building:'<path d="m2 8 10-6 10 6H2Zm2 13h16M6 9v9m6-9v9m6-9v9M3 18h18"/>',
 leaf:'<path d="M20 3C9 1 2 7 5 15c8 5 16-2 15-12ZM3 22 16 9"/>',
 bin:'<path d="M3 5h18M9 5V2h6v3M5 5l1 17h12l1-17M10 9v9m4-9v9"/>',
 construction:'<path d="m12 2 10 19H2L12 2ZM7 12h10M5 17h14"/>',
 food:'<path d="M4 2v7a3 3 0 0 0 6 0V2M7 2v20M20 2c-5 0-5 12 0 12v8m0-20v12"/>',
 camera:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="m6 7 2-4h8l2 4"/><circle cx="12" cy="14" r="4"/>',
};
// All paths are authored constants; no imported dataset text is interpolated here.
export const icon = name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.pin}</svg>`;
