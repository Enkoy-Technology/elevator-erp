import {
  NOTO_SANS_ETHIOPIC_BOLD_BASE64,
  NOTO_SANS_ETHIOPIC_REGULAR_BASE64,
} from '../fonts/noto-sans-ethiopic.data';

const toDataUri = (base64: string): string => `data:font/ttf;base64,${base64}`;

/**
 * Standard PDF/system fonts Chromium ships headless have no Ge'ez glyphs —
 * Amharic text renders as tofu boxes without an embedded Ethiopic font.
 * Base64 data URIs rather than file:// URLs: `isAllowedAssetUrl`'s
 * request-interception guard already treats `data:` as safe (and continues
 * to block `file:` as an SSRF vector for tenant-controlled branding URLs),
 * and a page loaded via `setContent` has no `file://` origin to resolve a
 * relative font path against reliably.
 */
export const ETHIOPIC_FONT_FACE_CSS = `
  @font-face {
    font-family: 'Noto Sans Ethiopic';
    src: url('${toDataUri(NOTO_SANS_ETHIOPIC_REGULAR_BASE64)}') format('truetype');
    font-weight: 400;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: 'Noto Sans Ethiopic';
    src: url('${toDataUri(NOTO_SANS_ETHIOPIC_BOLD_BASE64)}') format('truetype');
    font-weight: 700;
    font-style: normal;
    font-display: block;
  }
`;
