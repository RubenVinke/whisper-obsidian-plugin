export const DEFAULT_DEVICE_ID = "default";

export interface AudioDeviceSelection {
	/** Device id to use, or DEFAULT_DEVICE_ID for the system default. */
	deviceId: string;
	/** Human-readable label, empty for the system default. */
	label: string;
	/** True when the stored selection had to be remapped or reset. */
	changed: boolean;
}

/**
 * Ask for microphone access so enumerateDevices() returns real device labels.
 *
 * Browsers hide labels until a page has been granted microphone permission at
 * least once. The stream is released immediately; this exists only to unlock
 * the labels. Returns false when permission is refused, in which case devices
 * are still listed but appear unnamed.
 */
export async function requestMicrophoneAccess(): Promise<boolean> {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: true,
		});
		stream.getTracks().forEach((track) => track.stop());
		return true;
	} catch (err) {
		console.log(
			"Microphone permission not granted, device labels may be limited"
		);
		return false;
	}
}

/** List available audio input devices, or an empty array if enumeration fails. */
export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
	try {
		const all = await navigator.mediaDevices.enumerateDevices();
		return all.filter((device) => device.kind === "audioinput");
	} catch (err) {
		console.error("Error enumerating audio devices:", err);
		return [];
	}
}

/**
 * Build dropdown options: the system default followed by every input device.
 * Devices without a label (permission refused) get a short id-based fallback
 * so they remain distinguishable.
 */
export function buildDeviceOptions(
	devices: Pick<MediaDeviceInfo, "deviceId" | "label">[]
): Record<string, string> {
	const options: Record<string, string> = {
		[DEFAULT_DEVICE_ID]: "Default",
	};
	devices.forEach((device) => {
		options[device.deviceId] =
			device.label ||
			`Unknown device (${device.deviceId.substring(0, 8)})`;
	});
	return options;
}

/**
 * Resolve a stored selection against the devices currently present.
 *
 * deviceId is only stable while site storage survives, and Obsidian's Android
 * WebView drops it on cold start, so the same physical microphone reappears
 * under a fresh id. When the stored id is gone we re-match on the stored label
 * before falling back to the system default, which keeps a deliberate choice
 * from silently reverting.
 */
export function resolveSelectedDevice(
	savedDeviceId: string,
	savedLabel: string,
	devices: Pick<MediaDeviceInfo, "deviceId" | "label">[]
): AudioDeviceSelection {
	const current = savedDeviceId || DEFAULT_DEVICE_ID;

	if (current === DEFAULT_DEVICE_ID) {
		return { deviceId: DEFAULT_DEVICE_ID, label: "", changed: false };
	}

	const stillPresent = devices.some(
		(device) => device.deviceId === current
	);
	if (stillPresent) {
		const match = devices.find((device) => device.deviceId === current);
		return {
			deviceId: current,
			label: match?.label || savedLabel,
			changed: false,
		};
	}

	const relabeled = savedLabel
		? devices.find((device) => device.label === savedLabel)
		: undefined;
	if (relabeled) {
		return {
			deviceId: relabeled.deviceId,
			label: relabeled.label,
			changed: true,
		};
	}

	return { deviceId: DEFAULT_DEVICE_ID, label: "", changed: true };
}
