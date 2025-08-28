// sanitize filename / playlist names
module.exports = function sanitizeName(name) {
  return String(name || "")
    .replace(/[\\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
};
