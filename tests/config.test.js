"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const konfiguracja = require("../shared/config");

test("Bridge jest domyślnie wyłączony i nie zawiera danych dostępowych", () => {
  assert.equal(konfiguracja.DEFAULT_SETTINGS.sheetBridgeEnabled,false);
  assert.equal(konfiguracja.DEFAULT_SETTINGS.sheetBridgeUrl,"");
  assert.equal(konfiguracja.DEFAULT_SETTINGS.sheetBridgeKey,"");
  assert.equal(konfiguracja.DEFAULT_SETTINGS.sheetName,"");
});
