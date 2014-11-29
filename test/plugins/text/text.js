function jsEscape(content) {
  return content.replace(/(["'\\])/g, '\\$1')
         .replace(/[\f]/g, '\\f')
         .replace(/[\b]/g, '\\b')
         .replace(/[\n]/g, '\\n')
         .replace(/[\t]/g, '\\t')
         .replace(/[\r]/g, '\\r');
}

module.export = {
  detectExtension: true,
  translate: function(loader, entry) {
    return Promise.resolve('module.export = \'' +
                           jsEscape(entry.source) + '\';');
  }
};
