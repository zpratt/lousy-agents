export const __rspack_esm_id = "714";
export const __rspack_esm_ids = ["714"];
export const __webpack_modules__ = {
4689(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  digest: () => (/* reexport */ node_digest)
});

// UNUSED EXPORTS: isEqual, serialize, hash

// EXTERNAL MODULE: external "node:crypto"
var external_node_crypto_ = __webpack_require__(7598);
;// CONCATENATED MODULE: ../../node_modules/ohash/dist/crypto/node/index.mjs


const e=globalThis.process?.getBuiltinModule?.("crypto")?.hash,r="sha256",s="base64url";function node_digest(t){if(e)return e(r,t,s);const o=(0,external_node_crypto_.createHash)(r).update(t);return globalThis.process?.versions?.webcontainer?o.digest().toString(s):o.digest(s)}



;// CONCATENATED MODULE: ../../node_modules/ohash/dist/index.mjs





function hash(input) {
  return digest(serialize(input));
}




},

};
