"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTime = exports.debounce = void 0;
function debounce(fn, ms) {
	let timeout;
	return (...args) => {
		return new Promise(resolve => {
			clearTimeout(timeout);
			timeout = setTimeout(() => resolve(fn.call(null, args)), ms);
		});
	};
}
exports.debounce = debounce;
function formatTime(ms) {
	let seconds = Math.floor((ms / 1000) % 60);
	let minutes = Math.floor((ms / (1000 * 60)) % 60);
	let hours = Math.floor(ms / (1000 * 60 * 60));
	let str = "";
	if (hours > 0) {
		str += `${hours}h `;
	}
	if (minutes > 0) {
		str += `${minutes}min `;
	}
	if (seconds > 0) {
		str += `${seconds}s`;
	}
	if (str === "") {
		str += `${ms}ms`;
	}
	return str;
}
exports.formatTime = formatTime;
