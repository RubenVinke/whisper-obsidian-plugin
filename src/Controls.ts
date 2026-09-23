import Whisper from "main";
import { ButtonComponent, DropdownComponent, Modal } from "obsidian";
import { RecordingStatus } from "./StatusBar";
import {
	DEFAULT_DEVICE_ID,
	buildDeviceOptions,
	listAudioInputs,
	requestMicrophoneAccess,
	resolveSelectedDevice,
} from "./audioDevices";

export class Controls extends Modal {
	private plugin: Whisper;
	private startButton: ButtonComponent;
	private pauseButton: ButtonComponent;
	private stopButton: ButtonComponent;
	private cancelButton: ButtonComponent;
	private timerDisplay: HTMLElement;
	private statusListener: () => void;
	private deviceRowEl: HTMLElement;
	private deviceDropdown: DropdownComponent;
	private deviceOptions: Record<string, string> = {};

	constructor(plugin: Whisper) {
		super(plugin.app);
		this.plugin = plugin;
		this.containerEl.addClass("recording-controls");

		this.timerDisplay = this.contentEl.createEl("div", { cls: "timer" });
		this.updateTimerDisplay();

		this.plugin.timer.setOnUpdate(() => {
			this.updateTimerDisplay();
		});

		// Microphone picker, so the input can be checked and changed without
		// opening plugin settings. Populated in onOpen(), which needs to await
		// a permission prompt before device labels are readable.
		this.deviceRowEl = this.contentEl.createEl("div", {
			cls: "device-row",
		});
		this.deviceRowEl.createEl("span", {
			cls: "device-label",
			text: "Microphone",
		});
		this.deviceDropdown = new DropdownComponent(this.deviceRowEl);
		this.deviceDropdown.addOption(DEFAULT_DEVICE_ID, "Default");
		this.deviceDropdown.setDisabled(true);
		this.deviceDropdown.onChange(async (value) => {
			await this.selectDevice(value);
		});

		const buttonGroupEl = this.contentEl.createEl("div", {
			cls: "button-group",
		});

		this.startButton = new ButtonComponent(buttonGroupEl);
		this.startButton
			.setIcon("circle")
			.setButtonText(" Record")
			.onClick(() => this.plugin.startRecording())
			.buttonEl.addClass("button-component");

		this.pauseButton = new ButtonComponent(buttonGroupEl);
		this.pauseButton
			.setIcon("pause")
			.setButtonText(" Pause")
			.onClick(() => this.plugin.pauseRecording())
			.buttonEl.addClass("button-component");

		this.stopButton = new ButtonComponent(buttonGroupEl);
		this.stopButton
			.setIcon("square")
			.setButtonText(" Stop")
			.onClick(async () => {
				await this.plugin.stopRecording();
				this.close();
			})
			.buttonEl.addClass("button-component");

		this.cancelButton = new ButtonComponent(buttonGroupEl);
		this.cancelButton
			.setIcon("x")
			.setButtonText(" Cancel")
			.onClick(async () => {
				await this.plugin.cancelRecording();
				this.close();
			})
			.buttonEl.addClass("button-component");

		this.statusListener = () => {
			this.resetGUI();
			this.updateTimerDisplay();
		};
	}

	onOpen() {
		this.resetGUI();
		this.updateTimerDisplay();
		this.plugin.statusBar.onChange(this.statusListener);
		void this.populateDevices();
	}

	onClose() {
		this.plugin.statusBar.offChange(this.statusListener);
	}

	/**
	 * Fill the microphone dropdown.
	 *
	 * Permission is requested up front rather than on first recording: until it
	 * is granted the browser returns devices with blank labels, so the picker
	 * would read "Unknown device" and be useless for confirming the input.
	 */
	private async populateDevices(): Promise<void> {
		await requestMicrophoneAccess();
		const devices = await listAudioInputs();

		this.deviceOptions = buildDeviceOptions(devices);

		const selection = resolveSelectedDevice(
			this.plugin.settings.audioDeviceId,
			this.plugin.settings.audioDeviceLabel,
			devices
		);

		// The stored device disappeared or came back under a new id; persist the
		// resolved choice so settings and recorder agree.
		if (selection.changed) {
			this.plugin.settings.audioDeviceId = selection.deviceId;
			this.plugin.settings.audioDeviceLabel = selection.label;
			await this.plugin.settingsManager.saveSettings(
				this.plugin.settings
			);
			this.plugin.recorder.setDeviceId(
				selection.deviceId === DEFAULT_DEVICE_ID
					? null
					: selection.deviceId
			);
		}

		const selectEl = this.deviceDropdown.selectEl;
		selectEl.empty();
		Object.keys(this.deviceOptions).forEach((deviceId) => {
			this.deviceDropdown.addOption(
				deviceId,
				this.deviceOptions[deviceId]
			);
		});
		this.deviceDropdown.setValue(selection.deviceId);
		this.resetGUI();
	}

	private async selectDevice(deviceId: string): Promise<void> {
		this.plugin.settings.audioDeviceId = deviceId;
		this.plugin.settings.audioDeviceLabel =
			deviceId === DEFAULT_DEVICE_ID ? "" : this.deviceOptions[deviceId];
		await this.plugin.settingsManager.saveSettings(this.plugin.settings);
		this.plugin.recorder.setDeviceId(
			deviceId === DEFAULT_DEVICE_ID ? null : deviceId
		);
	}

	updateTimerDisplay() {
		this.timerDisplay.textContent = this.plugin.timer.getFormattedTime();
	}

	resetGUI() {
		const status = this.plugin.statusBar.status;
		const isIdle = status === RecordingStatus.Idle;
		const isPaused = status === RecordingStatus.Paused;

		// Switching input mid-recording would not affect the stream already
		// being captured, so the picker is only live while idle.
		this.deviceDropdown.setDisabled(!isIdle);
		this.deviceRowEl.toggleClass("is-disabled", !isIdle);

		this.startButton.buttonEl.style.display = isIdle ? "" : "none";
		this.startButton.buttonEl.empty();
		this.startButton.setIcon("circle");
		this.startButton.buttonEl.appendText(" Record");

		this.pauseButton.buttonEl.style.display = isIdle ? "none" : "";
		this.pauseButton.buttonEl.empty();
		this.pauseButton.setIcon(isPaused ? "play" : "pause");
		this.pauseButton.buttonEl.appendText(isPaused ? " Resume" : " Pause");

		this.stopButton.buttonEl.style.display = isIdle ? "none" : "";
		this.stopButton.buttonEl.empty();
		this.stopButton.setIcon("square");
		this.stopButton.buttonEl.appendText(" Stop");

		this.cancelButton.buttonEl.style.display = isIdle ? "none" : "";
		this.cancelButton.buttonEl.empty();
		this.cancelButton.setIcon("x");
		this.cancelButton.buttonEl.appendText(" Cancel");
	}
}
