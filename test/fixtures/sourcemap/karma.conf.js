const { baseConfig } = require("../../base.karma.conf");

module.exports = function (config) {
	config.set({
		...baseConfig,
		preprocessors: {
			"**/*.js": ["esbuild", "sourcemap"],
		},
	});
};
