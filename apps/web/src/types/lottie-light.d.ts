// The light build of lottie-web (SVG only, no expression engine) ships without its own types.
declare module "lottie-web/build/player/lottie_light" {
  import lottie from "lottie-web";
  export default lottie;
}
