// React renderer for the answer catalog `app-catalog/v1`, built on @a2ui/react. App-specific drawing
// of data components is passed in through a `CatalogHost`, so ui-kit never imports from the app.
export { AnswerSurface, type AnswerSurfaceProps } from "./AnswerSurface";
export { answerCatalog } from "./catalog";
export {
  type AppRenderedName,
  type CatalogHost,
  CatalogHostProvider,
  type CatalogLabels,
  type ChipAction,
  type RenderProps,
  useCatalogHost,
} from "./host";
