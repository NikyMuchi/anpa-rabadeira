module.exports = {
  eleventyComputed: {
    permalink: (data) => {
      if (data.legalSlug) {
        return (data.site && data.site.legalPagesEnabled) ? `/${data.legalSlug}/` : false;
      }
      return data.permalink;
    }
  }
};
