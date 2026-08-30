/**
 * V2.6 FIND-02 — the shared tagging surface's client seam.
 *
 * One hook, so every tagging form in the product reads the vocabulary from the
 * same endpoint. The CONTROL is `~/shared/forms`'s `TagsField`, which stays a
 * pure DS-06 field and takes the vocabulary as a prop.
 */

export { TAG_VOCABULARY_PATH, useTagVocabulary } from "./use-tag-vocabulary";
