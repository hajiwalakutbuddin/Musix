// backend/utils/strongSanitize.js
module.exports.strongSanitize = function strongSanitize(name) {
  let out = String(name || "").trim();
  out = out.replace(/[\\\/:*?"<>|]/g, "_");
  out = out.replace(/\.+/g, "_");
  out = out.replace(/\s+/g, "_");
  if (!out) out = "default";
  if (out.length > 64) out = out.slice(0, 64);
  return out;
};
