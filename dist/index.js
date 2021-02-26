"use strict";
var __createBinding =
	(this && this.__createBinding) ||
	(Object.create
		? function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				Object.defineProperty(o, k2, {
					enumerable: true,
					get: function () {
						return m[k];
					},
				});
		  }
		: function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				o[k2] = m[k];
		  });
var __setModuleDefault =
	(this && this.__setModuleDefault) ||
	(Object.create
		? function (o, v) {
				Object.defineProperty(o, "default", { enumerable: true, value: v });
		  }
		: function (o, v) {
				o["default"] = v;
		  });
var __importStar =
	(this && this.__importStar) ||
	function (mod) {
		if (mod && mod.__esModule) return mod;
		var result = {};
		if (mod != null)
			for (var k in mod)
				if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
					__createBinding(result, mod, k);
		__setModuleDefault(result, mod);
		return result;
	};
var __importDefault =
	(this && this.__importDefault) ||
	function (mod) {
		return mod && mod.__esModule ? mod : { default: mod };
	};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const cache_1 = require("./cache");
const chokidar_1 = __importDefault(require("chokidar"));
const esbuild = __importStar(require("esbuild"));
const path = __importStar(require("path"));
const cache = cache_1.newCache();
function createPreprocessor(config, emitter, logger) {
	const log = logger.create("esbuild");
	const base = config.basePath || process.cwd();
	// Inject sourcemap middleware
	if (!config.middleware) {
		config.middleware = [];
	}
	config.middleware.push("esbuild");
	let service = null;
	function processResult(result, file) {
		const map = result.outputFiles[0];
		const mapText = JSON.parse(map.text);
		// Sources paths must be absolute, otherwise vscode will be unable
		// to find breakpoints
		mapText.sources = mapText.sources.map(s => path.join(base, s));
		const source = result.outputFiles[1];
		const relative = path.relative(base, file);
		const code = source.text + `\n//# sourceMappingURL=/base/${relative}.map`;
		cache.set(relative, {
			file: source.path,
			content: code,
			mapFile: map.path,
			mapText,
			mapContent: JSON.stringify(mapText, null, 2),
			time: Date.now(),
		});
		return cache.get(relative);
	}
	let watcher = null;
	const watchMode = !config.singleRun && !!config.autoWatch;
	if (watchMode) {
		// Initialize watcher to listen for changes in basePath so
		// that we'll be notified of any new files
		const basePath = config.basePath || process.cwd();
		watcher = chokidar_1.default.watch([basePath], {
			ignoreInitial: true,
			// Ignore dot files and anything from node_modules
			ignored: /((^|[/\\])\..|node_modules)/,
		});
		// Register shutdown handler
		emitter.on("exit", done => {
			watcher.close();
			done();
		});
		const onWatch = utils_1.debounce(() => {
			cache.clear();
			emitter.refreshFiles();
		}, 100);
		watcher.on("change", onWatch);
		watcher.on("add", onWatch);
	}
	async function build(file) {
		const userConfig = { ...config.esbuild };
		const result = await service.build({
			target: "es2015",
			...userConfig,
			bundle: true,
			write: false,
			entryPoints: [file],
			platform: "browser",
			sourcemap: "external",
			outdir: base,
			define: {
				"process.env.NODE_ENV": JSON.stringify(
					process.env.NODE_ENV || "development",
				),
				...userConfig.define,
			},
		});
		return processResult(result, file);
	}
	const entries = new Set();
	const beforeProcess = utils_1.debounce(() => {
		log.info("Compiling...");
	}, 10);
	const afterPreprocess = utils_1.debounce(time => {
		log.info(`Compiling done (${utils_1.formatTime(Date.now() - time)})`);
	}, 10);
	let stopped = false;
	let count = 0;
	let startTime = 0;
	return async function preprocess(content, file, done) {
		// Prevent service closed message when we are still processing
		if (stopped) return;
		if (count === 0) {
			beforeProcess();
			startTime = Date.now();
		}
		count++;
		entries.add(file.originalPath);
		if (service === null) {
			service = await esbuild.startService();
			emitter.on("exit", done => {
				stopped = true;
				service.stop();
				done();
			});
		}
		const relative = path.relative(base, file.originalPath);
		try {
			const result = cache.has(relative)
				? await cache.get(relative)
				: await build(file.originalPath);
			// Necessary for mappings in stack traces
			file.sourceMap = result.mapText;
			if (--count === 0) {
				afterPreprocess(startTime);
			}
			// make sure the file has the `.js` extension
			if (path.extname(file.path) !== ".js") {
				file.path = `${
					file.path.substr(0, file.path.lastIndexOf(".")) || file.path
				}.js`;
			}
			done(null, result.content);
		} catch (err) {
			// Use a non-empty string because `karma-sourcemap` crashes
			// otherwse.
			const dummy = `(function () {})()`;
			// Prevent flood of error logs when we shutdown
			if (stopped) {
				done(null, dummy);
				return;
			}
			log.error(err.message);
			if (--count === 0) {
				afterPreprocess(startTime);
			}
			if (watchMode) {
				// Never return an error in watch mode, otherwise the
				// watcher will shutdown.
				// Use a dummy file instead because the original content
				// may content syntax not supported by a browser or the
				// way the script was loaded. This breaks the watcher too.
				done(null, dummy);
			} else {
				done(err, null);
			}
		}
	};
}
createPreprocessor.$inject = ["config", "emitter", "logger"];
function createSourceMapMiddleware() {
	return async function (req, res, next) {
		const url = (req.url || "").replace(/^\/base\//, "");
		const key = url.replace(/\.map$/, "");
		// Always resolve from cache directly
		const item = await cache.get(key);
		if (item) {
			res.setHeader("Content-Type", "application/json");
			res.end(item.mapContent);
		} else {
			next();
		}
	};
}
module.exports = {
	"preprocessor:esbuild": ["factory", createPreprocessor],
	"middleware:esbuild": ["factory", createSourceMapMiddleware],
};
