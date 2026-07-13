// jsdom doesn't implement the Web Animations API, which the editor's FLIP /
// fade-in code exercises on every render. Real browsers all have it, so the
// stubs live here rather than as guards in the components. The fake Animation
// covers what the code touches: id/onfinish assignment and cancel().
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}
if (typeof Element !== "undefined" && !Element.prototype.animate) {
  Element.prototype.animate = () =>
    ({ id: "", onfinish: null, cancel() {} }) as unknown as Animation;
}
