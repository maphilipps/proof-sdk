export interface PageSetup {
  widthCm: number;
  heightCm: number;
  widthTwips: number;
  heightTwips: number;
  marginTopCm: number;
  marginRightCm: number;
  marginBottomCm: number;
  marginLeftCm: number;
  marginTopTwips: number;
  marginRightTwips: number;
  marginBottomTwips: number;
  marginLeftTwips: number;
  headerHeightCm: number;
  headerHeightTwips: number;
  footerHeightCm: number;
  footerHeightTwips: number;
}

/** Shared A4 page geometry, matching docs/word-template/adesso_template.dotx. */
export const PAGE_A4: PageSetup = {
  widthCm: 21,
  heightCm: 29.7,
  widthTwips: 11906,
  heightTwips: 16838,
  marginTopCm: 4,
  marginRightCm: 2.5,
  marginBottomCm: 2.7,
  marginLeftCm: 2.5,
  marginTopTwips: 2268,
  marginRightTwips: 1418,
  marginBottomTwips: 1531,
  marginLeftTwips: 1418,
  headerHeightCm: 1.5,
  headerHeightTwips: 851,
  footerHeightCm: 1.2,
  footerHeightTwips: 680,
};
