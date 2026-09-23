import { describe, it, expect } from "vitest";
import {
	DEFAULT_DEVICE_ID,
	buildDeviceOptions,
	resolveSelectedDevice,
} from "../src/audioDevices";

type Device = { deviceId: string; label: string };

const builtInMic: Device = { deviceId: "abc123", label: "MacBook Pro Microphone" };
const usbMic: Device = { deviceId: "def456", label: "Yeti Stereo Microphone" };

describe("buildDeviceOptions", () => {
	it("always offers the system default first", () => {
		const options = buildDeviceOptions([builtInMic]);
		expect(Object.keys(options)[0]).toBe(DEFAULT_DEVICE_ID);
		expect(options[DEFAULT_DEVICE_ID]).toBe("Default");
	});

	it("uses the device label when present", () => {
		const options = buildDeviceOptions([builtInMic, usbMic]);
		expect(options["abc123"]).toBe("MacBook Pro Microphone");
		expect(options["def456"]).toBe("Yeti Stereo Microphone");
	});

	it("falls back to a truncated id when the label is hidden", () => {
		// Browsers blank the label until microphone permission is granted.
		const options = buildDeviceOptions([
			{ deviceId: "0123456789abcdef", label: "" },
		]);
		expect(options["0123456789abcdef"]).toBe("Unknown device (01234567)");
	});

	it("returns only the default when no inputs exist", () => {
		expect(buildDeviceOptions([])).toEqual({
			[DEFAULT_DEVICE_ID]: "Default",
		});
	});
});

describe("resolveSelectedDevice", () => {
	it("leaves the system default alone", () => {
		const result = resolveSelectedDevice(DEFAULT_DEVICE_ID, "", [builtInMic]);
		expect(result).toEqual({
			deviceId: DEFAULT_DEVICE_ID,
			label: "",
			changed: false,
		});
	});

	it("treats empty stored settings as the default", () => {
		const result = resolveSelectedDevice("", "", [builtInMic]);
		expect(result.deviceId).toBe(DEFAULT_DEVICE_ID);
		expect(result.changed).toBe(false);
	});

	it("keeps a selection whose id is still present", () => {
		const result = resolveSelectedDevice("def456", "Yeti Stereo Microphone", [
			builtInMic,
			usbMic,
		]);
		expect(result.deviceId).toBe("def456");
		expect(result.changed).toBe(false);
	});

	it("re-matches by label when the id changed underneath it", () => {
		// Android WebView hands out a fresh deviceId for the same physical mic
		// after a cold start; the label is what survives.
		const rotated: Device = {
			deviceId: "zzz999",
			label: "Yeti Stereo Microphone",
		};
		const result = resolveSelectedDevice(
			"def456",
			"Yeti Stereo Microphone",
			[builtInMic, rotated]
		);
		expect(result.deviceId).toBe("zzz999");
		expect(result.label).toBe("Yeti Stereo Microphone");
		expect(result.changed).toBe(true);
	});

	it("falls back to default when the device is genuinely gone", () => {
		const result = resolveSelectedDevice(
			"def456",
			"Yeti Stereo Microphone",
			[builtInMic]
		);
		expect(result.deviceId).toBe(DEFAULT_DEVICE_ID);
		expect(result.label).toBe("");
		expect(result.changed).toBe(true);
	});

	it("falls back to default when the id is missing and no label was stored", () => {
		// Settings written before audioDeviceLabel existed have nothing to match on.
		const result = resolveSelectedDevice("def456", "", [builtInMic]);
		expect(result.deviceId).toBe(DEFAULT_DEVICE_ID);
		expect(result.changed).toBe(true);
	});

	it("does not re-match a blank label against unlabelled devices", () => {
		// Otherwise a denied permission prompt would silently bind the stored
		// selection to whichever unnamed device happened to enumerate first.
		const result = resolveSelectedDevice("def456", "", [
			{ deviceId: "new1", label: "" },
		]);
		expect(result.deviceId).toBe(DEFAULT_DEVICE_ID);
		expect(result.changed).toBe(true);
	});
});
