/* @flow */

process.env.VUE_ENV = "server";

import modules from "./server/modules/index";
import baseDirectives from "./server/directives/index";
import { isUnaryTag, canBeLeftOpenTag } from "./compiler/util";

import { createRenderer } from "server/create-renderer";
import { createBundleRendererCreator } from "server/bundle-renderer/create-bundle-renderer";

const renderOptions = {
  isUnaryTag,
  canBeLeftOpenTag,
  modules,
  // user can provide server-side implementations for custom directives
  // when creating the renderer.
  directives: baseDirectives
}

export const createBundleRenderer = createBundleRendererCreator(createRenderer, renderOptions);
