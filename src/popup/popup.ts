import browser from 'webextension-polyfill';
import { actions, SessionListViewItem } from '../shared/contracts';

document.addEventListener('DOMContentLoaded', async () => {

  const viewManager = new ViewManager();

  viewManager.registerViews([
    new AccountView(),
    new ImportAccountView(),
    new SetProfileView(),
    new KeysView(),
    new HomeView(),
    new FaqView(),
    new AboutView(),
    new SettingView(),
    new ToolbarView()]);

  const viewFlow = new ViewFlow(viewManager);
  viewFlow.setupFlow();

  const response = await browser.runtime.sendMessage({ action: actions.CHECK_USER_SESSION });
  const startingView = response.hasSession ? Views.HOME : Views.ACCOUNT;
  viewManager.navigateToView(startingView);
});

abstract class BaseView {
  abstract onBeforeShow(): void;
  abstract show(): void;
  abstract hide(): void;

  protected element: HTMLElement;

  constructor(public viewId: ViewId) {
    const el = document.getElementById(viewId);
    if (!el) {
      throw new Error(`View with id ${viewId} not found.`);
    }
    this.element = el;
  }

  protected short(text: string, size: number): string {
    const start = text.slice(0, size);
    const end = text.slice(-size);
    return `${start}...${end}`;
  }

  protected async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      throw new Error('Failed to copy text');
    }
  }

  protected async withLoadingAsync(asyncHandler: () => Promise<void>): Promise<void> {
    this.setLoading(true);
    try {
      await asyncHandler();
    } catch (error) {
      console.error(error);
    } finally {
      this.setLoading(false);
    }
  }

  protected async addEventListenerWithLoading(
    element: HTMLElement | null,
    eventName: string,
    asyncHandler: (event: Event) => Promise<void>
  ): Promise<void> {
    if (!element) return;

    element.addEventListener(eventName, async (event) => {
      await this.withLoadingAsync(() => asyncHandler(event));
    });
  }

  private setLoading(on: boolean): void {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.style.display = on ? 'flex' : 'none';
    }
  }
}

class AccountView extends BaseView {

  viewId = Views.ACCOUNT;

  public constructor() {
    super(Views.ACCOUNT);
    this.registerOnCreateAccountEventHandler();
    this.registerOnImportAccountEventHandler();
  }

  public onBeforeShow(): void {
    return;
  }

  public show() {
    this.element.style.display = 'table';
  }

  public hide() {
    this.element.style.display = 'none';
  }

  public onCreateAccountCompleted?: () => void;

  public onImportAccountCompleted?: () => void;

  private registerOnImportAccountEventHandler(): void {
    const importAccountButton = document.getElementById('import-account');

    this.addEventListenerWithLoading(importAccountButton, 'click', async () => {
      if (this.onImportAccountCompleted) {
        this.onImportAccountCompleted();
      }
    });
  }

  private registerOnCreateAccountEventHandler(): void {
    const newAccountButton = document.getElementById('new-account');

    this.addEventListenerWithLoading(newAccountButton, 'click', async () => {
      if (this.onCreateAccountCompleted) {
        this.onCreateAccountCompleted();
      }
    });
  }
}

class ImportAccountView extends BaseView {

  constructor() {
    super(Views.IMPORT_ACCOUNT);
    this.registerOnOkEventHandler();
  }

  onBeforeShow(): void {
  }

  show(): void {
    this.element.style.display = 'block';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  public onAccountImportOkCompleted?: () => void;

  private registerOnOkEventHandler() {
    const ok = document.getElementById("import-account-ok-button");
    this.addEventListenerWithLoading(ok, "click", async () => {
      const form = document.getElementById('import-account-form') as HTMLFormElement;
      const nsec = form["_import_nsec"].value;
      await browser.runtime.sendMessage({ action: actions.IMPORT_ACCOUNT, payload: { nsec: nsec } });
      if (this.onAccountImportOkCompleted) this.onAccountImportOkCompleted();
    });
  }

}

class SetProfileView extends BaseView {

  constructor() {
    super(Views.SET_PROFILE);
    this.registerOnProfileSaveEventHandler();
  }

  async onBeforeShow(): Promise<void> {
    await this.loadProfileDataAsync();
  }
  show(): void {
    this.element.style.display = 'block';
  }
  hide(): void {
    this.element.style.display = 'none';
  }

  public onProfileSetupCompleted?: () => void;

  public onProfileEditCompleted?: () => void;

  private async loadProfileDataAsync(): Promise<void> {
    const sessionResponse = await browser.runtime.sendMessage({ action: actions.CHECK_USER_SESSION });

    const form = document.getElementById('user-profile-form') as HTMLFormElement;

    if (!sessionResponse.hasSession) {
      for (let i = 0; i < form.elements.length; i++) {
        const inputElement = form.elements[i] as HTMLInputElement;
        inputElement.value = "";
      }
      return;
    }

    const response = await browser.runtime.sendMessage({ action: actions.LOAD_PROFILE_DATA });
    const data = response.profile;


    form["_name"].value = data.name;
    form["_displayName"].value = data.display_name;
    form["_about"].value = data.about;
    form["_picture"].value = data.picture;
    form["_banner"].value = data.banner;
    form["_nip05"].value = data.nip05;
    form["_lnAddress"].value = data.lud16;
  }

  private registerOnProfileSaveEventHandler(): void {
    const element = document.getElementById('user-profile-form') as HTMLFormElement;

    this.addEventListenerWithLoading(element, 'submit', async (event) => {
      event.preventDefault();
      const response = await browser.runtime.sendMessage({ action: actions.CHECK_USER_SESSION });
      const accountCreated = response.hasSession;

      const formData = new FormData(element);

      const profileData: any = {};

      for (const [key, value] of formData.entries()) {
        profileData[key] = value == "" ? null : value;
      }

      if (accountCreated) {
        await browser.runtime.sendMessage({
          action: actions.UPDATE_PROFILE, payload: {
            data: profileData
          }
        });
        if (this.onProfileEditCompleted) {
          this.onProfileEditCompleted();
        }
      } else {
        await browser.runtime.sendMessage({
          action: actions.SET_PROFILE, payload: {
            data: profileData
          }
        });
        if (this.onProfileSetupCompleted) {
          this.onProfileSetupCompleted();
        }
      }
    });
  }
}

class KeysView extends BaseView {

  constructor() {
    super(Views.KEYS);
    this.registerOnPubKeyCopyEventHandler();
    this.registerOnPrivKeyCopyEventHandler();
    this.registerOnOkEventHandler();
  }

  async onBeforeShow(): Promise<void> {

    await this.withLoadingAsync(async () => {
      const response = await browser.runtime.sendMessage({ action: actions.GET_KEYS });

      const publicKeyInput = document.getElementById('public-key') as HTMLSpanElement;
      const publicKeyHidden = document.getElementById('public-key-hidden') as HTMLSpanElement;;
      const privateKeyHidden = document.getElementById('private-key-hidden') as HTMLInputElement;

      publicKeyHidden.textContent = response.npub;
      const shortPubKey = this.short(response.npub, 10);
      publicKeyInput.textContent = shortPubKey;

      privateKeyHidden.textContent = response.nsec;

      //set download link
      const jsonData = JSON.stringify(response, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const downloadLink = document.querySelector('#download-keys') as HTMLAnchorElement;
      downloadLink.href = url;
      downloadLink.download = response.npub;
    });
  }

  show(): void {
    this.element.style.display = 'block'
  }
  hide(): void {
    this.element.style.display = 'none'
  }

  public onKeysOkCompleted?: () => void;

  private registerOnPubKeyCopyEventHandler() {
    const pubKeyCopy = document.getElementById("public-key-copy");
    this.addEventListenerWithLoading(pubKeyCopy, "click", async () => {
      const publicKeyInput = document.getElementById('public-key-hidden');
      if (publicKeyInput?.textContent) {
        this.copyToClipboard(publicKeyInput.textContent);
      }
    });
  }

  private registerOnPrivKeyCopyEventHandler() {
    const privKeyCopy = document.getElementById("private-key-copy");
    this.addEventListenerWithLoading(privKeyCopy, "click", async () => {
      const privateKeyInput = document.getElementById('private-key-hidden');
      if (privateKeyInput?.textContent) {
        this.copyToClipboard(privateKeyInput.textContent);
      }
    });
  }

  private registerOnOkEventHandler() {
    const ok = document.getElementById("keys-ok-button");
    this.addEventListenerWithLoading(ok, "click", async () => {
      if (this.onKeysOkCompleted) this.onKeysOkCompleted();
    });
  }
}

class ToolbarView extends BaseView {
  onBeforeShow(): void {
    return;
  }
  show(): void {
    return;
  }
  hide(): void {
    return;
  }
  constructor() {
    super(Views.TOOLBAR);
    this.registerOnToolbarHomeEventHandler();
    this.registerOnToolbarProfileEventHandler();
    this.registerOnToolbarKeysEventHandler();
    this.registerOnToolbarFaqEventHandler();
    this.registerOnToolbarAboutEventHandler();
    this.registerOnToolbarSettingsEventHandler();
    this.registerOnToolbarSignOutEventHandler();
  }

  public onHomeOptionEvent?: () => void;

  public onProfileOptionEvent?: () => void;

  public onKeysOptionEvent?: () => void;

  public OnFaqOptionEvent?: () => void;

  public OnAboutOptionEvent?: () => void;

  public onSettingsOptionEvent?: () => void;

  public onSignOutOptionEvent?: () => void;

  private registerOnToolbarHomeEventHandler() {
    const keysOption = document.getElementById("toolbar-home-button");
    this.addEventListenerWithLoading(keysOption, "click", async () => {
      if (this.onHomeOptionEvent) this.onHomeOptionEvent();
    });
  }

  private registerOnToolbarProfileEventHandler() {
    const profileOption = document.getElementById("toolbar-profile-button");
    this.addEventListenerWithLoading(profileOption, "click", async () => {
      if (this.onProfileOptionEvent) this.onProfileOptionEvent();
    });
  }

  private registerOnToolbarKeysEventHandler() {
    const keysOption = document.getElementById("toolbar-keys-button");
    this.addEventListenerWithLoading(keysOption, "click", async () => {
      if (this.onKeysOptionEvent) this.onKeysOptionEvent();
    });
  }

  private registerOnToolbarFaqEventHandler() {
    const keysOption = document.getElementById("toolbar-faq-button");
    this.addEventListenerWithLoading(keysOption, "click", async () => {
      if (this.OnFaqOptionEvent) this.OnFaqOptionEvent();
    });
  }

  private registerOnToolbarAboutEventHandler() {
    const keysOption = document.getElementById("toolbar-about-button");
    this.addEventListenerWithLoading(keysOption, "click", async () => {
      if (this.OnAboutOptionEvent) this.OnAboutOptionEvent();
    });
  }

  private registerOnToolbarSettingsEventHandler() {
    const keysOption = document.getElementById("toolbar-settings-button");
    this.addEventListenerWithLoading(keysOption, "click", async () => {
      if (this.onSettingsOptionEvent) this.onSettingsOptionEvent();
    });
  }

  private registerOnToolbarSignOutEventHandler() {
    const signOutOption = document.getElementById("toolbar-sign-out-button");
    this.addEventListenerWithLoading(signOutOption, "click", async () => {
      if (this.onSignOutOptionEvent) this.onSignOutOptionEvent();
    });
  }
}

class HomeView extends BaseView {

  private firstLoad = true;

  constructor() {
    super(Views.HOME);
    this.registerNewSessionModal();
    this.registerOnDeleteSessionOk();
  }

  async onBeforeShow(): Promise<void> {
    if (this.firstLoad) {
      //await this.saveUntrackedSession();
      await this.loadProfile();
      await this.loadSessions();
      this.firstLoad = false;
    }
  }

  show(): void {
    const toolbar = document.getElementById("toolbar");
    if (toolbar instanceof HTMLElement) toolbar.style.display = 'flex';
    this.element.style.display = 'block';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  private bindSessionsToTable(sessions: SessionListViewItem[]): void {
    let table = document.querySelector(".saved-sessions") as HTMLTableElement;

    // Clear the existing rows in the table, except for the header row
    while (table.rows.length > 1) {
      table.deleteRow(1);
    }

    const sortedSessions = sessions.sort((a, b) => a.name.localeCompare(b.name));

    sortedSessions.forEach((session: SessionListViewItem) => {
      const row = table!.insertRow(-1);
      row.className = 'session-item';
      const cell1 = row.insertCell(0);
      cell1.textContent = session.name;

      const cell2 = row.insertCell(1);
      cell2.textContent = String(session.totalTabs).padStart(2, '0');

      const cell3 = row.insertCell(2);
      const link1 = document.createElement('a');
      link1.href = '#';
      link1.onclick = async (event) => {
        event.preventDefault();
        await this.withLoadingAsync(async () => {
          await browser.runtime.sendMessage({
            action: actions.RESTORE_SESSION, payload: {
              sessionId: session.sessionId
            }
          });
        });
      }
      const icon1 = document.createElement('i');
      icon1.className = 'fas fa-external-link-alt';
      link1.appendChild(icon1);
      cell3.appendChild(link1);

      const cell4 = row.insertCell(3);
      const link2 = document.createElement('a');
      link2.href = '#';
      link2.setAttribute('name', 'delete-session');
      link2.setAttribute('data-session-id', session.sessionId);
      link2.onclick = function (event) {
        event.preventDefault();
        var modal = document.getElementById("delete-session-modal")! as HTMLElement;
        modal.style.display = "block";
        modal.setAttribute('data-session-id', session.sessionId);
      };
      const icon2 = document.createElement('i');
      icon2.className = 'fas fa-trash-alt';
      link2.appendChild(icon2);
      cell4.appendChild(link2);
    });
  }

  private async loadSessions(): Promise<void> {
    await this.withLoadingAsync(async () => {
      const response = await browser.runtime.sendMessage({ action: actions.LOAD_SESSIONS });
      this.bindSessionsToTable(response.sessionsList);
    });
  }

  private async saveUntrackedSession(): Promise<void> {
    await this.withLoadingAsync(async () => {
      const window = await browser.windows.getCurrent({ populate: true });
      await browser.runtime.sendMessage({
        action: actions.SAVE_UNTRACKED_SESSION,
        payload: {
          window: window
        }
      });
    });
  }

  private async loadProfile(): Promise<void> {
    await this.withLoadingAsync(async () => {
      const window = await browser.windows.getCurrent();
      const response = await browser.runtime.sendMessage({
        action: actions.LOAD_HOME_PROFILE,
        payload: {
          windowId: window.id!
        }
      });

      const activeSessionElement = document.getElementById('home-active-session');
      if (activeSessionElement) {
        activeSessionElement.innerText = response.session;
      }

      const bannerImage = document.getElementById('banner-image');
      if (bannerImage instanceof HTMLImageElement) {
        bannerImage.src = response.banner;
      }
      const profilePicture = document.getElementById('profile-picture');
      if (profilePicture instanceof HTMLImageElement) {
        profilePicture.src = response.profile;
      }
      const displayName = document.getElementById('home-display-name');

      if (displayName) {

        if (response.displayName.length > 10) {
          displayName.style.fontSize = '14px'
          displayName.textContent = this.short(response.displayName, 10);
        } else {
          displayName.textContent = response.displayName;
        }
      }

      const username = document.getElementById('home-username');
      if (username) {
        username.textContent = response.name;
      }
    });
  }

  private registerNewSessionModal(): void {
    var modal = document.getElementById("new-session-modal")! as HTMLElement;
    var newSessionBtn = document.getElementById("new-session-button")! as HTMLElement;

    //close modal on outside click
    window.addEventListener('click', function (event) {
      if (event.target === modal) {
        modal.style.display = "none";
      }
    });

    newSessionBtn.onclick = function () {
      modal.style.display = "block";
    }

    const element = document.getElementById('new-session-form') as HTMLFormElement;

    this.addEventListenerWithLoading(element, 'submit', async (event) => {
      event.preventDefault();

      const sessionName = (document.querySelector('input[name="sessionName"]') as HTMLInputElement).value;
      const window = await browser.windows.getCurrent({ populate: true });

      var response = await browser.runtime.sendMessage({
        action: actions.SAVE_NEW_SESSION, payload: {
          sessionName: sessionName,
          window: window
        }
      });

      const activeSessionElement = document.getElementById('home-active-session');
      if (activeSessionElement) {
        activeSessionElement.innerText = sessionName;
      }

      this.bindSessionsToTable(response.sessionsList);
      modal.style.display = "none";
    });
  }

  private registerOnDeleteSessionOk(): void {

    var modal = document.getElementById("delete-session-modal")! as HTMLElement;

    //close modal on outside click
    window.addEventListener('click', function (event) {
      if (event.target === modal) {
        modal.style.display = "none";
      }
    });

    const okButton = document.getElementById('delete-session-ok')!;
    okButton.addEventListener('click', async (event) => {
      await this.withLoadingAsync(async () => {
        const sessionId = modal.getAttribute('data-session-id');
        if (sessionId) {
          const response = await browser.runtime.sendMessage({
            action: actions.DELETE_SESSION,
            payload: {
              sessionId: sessionId,
            }
          });
          this.loadProfile();
          this.bindSessionsToTable(response.sessionsList);
          modal.style.display = "none";
          modal.setAttribute('data-session-id', "");
        }
      });
    });
  }
}

class AboutView extends BaseView {
  async onBeforeShow(): Promise<void> {
    await this.loadProfile();
  }
  show(): void {
    this.element.style.display = '';
  }
  hide(): void {
    this.element.style.display = 'none';
  }
  constructor() {
    super(Views.ABOUT);
  }

  private async loadProfile() {
    await this.withLoadingAsync(async () => {
      const window = await browser.windows.getCurrent();
      const response = await browser.runtime.sendMessage({
        action: actions.LOAD_OBLISK_PROFILE,
        payload: {
          windowId: window.id!
        }
      });

      const profilePicture = document.getElementById('about-profile-picture');
      if (profilePicture instanceof HTMLImageElement) {
        profilePicture.src = response.profile;
      }
    });
  }
}

class FaqView extends BaseView {
  constructor() {
    super(Views.FAQ);

    const faqQuestions = document.querySelectorAll('.faq-question');

    faqQuestions.forEach(question => {
      question.addEventListener('click', () => {
        const answer = question.nextElementSibling as HTMLElement;
        const toggle = question.querySelector('.faq-toggle');
        answer!.style.display = answer.style.display === 'none' ? 'block' : 'none';
        toggle!.textContent = answer.style.display === 'none' ? '+' : '-';
      });
    });

  }
  onBeforeShow(): void {
    return;
  }
  show(): void {
    this.element.style.display = 'block';
  }
  hide(): void {
    this.element.style.display = 'none';
  }
}

class SettingView extends BaseView {
  constructor() {
    super(Views.SETTINGS);
    this.registerOnSaveEventHandler();
  }

  async onBeforeShow(): Promise<void> {
    await this.loadSettingsAsync();
  }
  show(): void {
    this.element.style.display = 'block';
  }
  hide(): void {
    this.element.style.display = 'none';
  }
  public onSettingsSaveCompleted?: () => void;

  private registerOnSaveEventHandler() {
    const save = document.getElementById("save-settings");
    this.addEventListenerWithLoading(save, "click", async () => {
      const form = document.getElementById('settings-form') as HTMLFormElement;
      const restore = form["_restore-session"].checked;
      const enableSigner = form["_enable-signer"].checked;
      await browser.runtime.sendMessage(
        {
          action: actions.SAVE_SETTINGS, payload: {
            restoreSession: restore,
            enableSigner: enableSigner
          }
        });
      if (this.onSettingsSaveCompleted) this.onSettingsSaveCompleted();
    });
  }

  private async loadSettingsAsync(): Promise<void> {
    const response = await browser.runtime.sendMessage({ action: actions.LOAD_SETTINGS });

    const restoreSessionCheckbox = document.getElementById('restore-session-checkbox') as HTMLInputElement;
    const enableSignerCheckbox = document.getElementById('enable-signer-checkbox') as HTMLInputElement;

    restoreSessionCheckbox.checked = response.restoreSession;
    enableSignerCheckbox.checked = response.enableSigner;
  }
}

class ViewManager {
  private currentView?: BaseView;
  private views: Map<ViewId, BaseView> = new Map();

  constructor() { }

  public registerViews(views: BaseView[]) {
    views.forEach(view => {
      this.views.set(view.viewId, view);
    })
  }

  public async navigateToView(viewId: ViewId): Promise<void> {
    if (this.currentView) {
      this.currentView.hide();
    }

    const nextView = this.views.get(viewId);
    if (nextView) {
      nextView.onBeforeShow();
      nextView.show();
      this.currentView = nextView;
    }
  }

  public getView(viewId: ViewId): BaseView | undefined {
    return this.views.get(viewId);
  }
}


class ViewFlow {
  constructor(private viewManager: ViewManager) { }

  setupFlow() {
    const accountView = this.viewManager.getView(Views.ACCOUNT);
    if (accountView instanceof AccountView) {
      accountView.onCreateAccountCompleted = () => {
        this.viewManager.navigateToView(Views.SET_PROFILE);
      };

      accountView.onImportAccountCompleted = () => {
        this.viewManager.navigateToView(Views.IMPORT_ACCOUNT);
      };
    }

    const importAccountView = this.viewManager.getView(Views.IMPORT_ACCOUNT);
    if (importAccountView instanceof ImportAccountView) {
      importAccountView.onAccountImportOkCompleted = () => {
        this.viewManager.navigateToView(Views.HOME);
      }
    }

    const setProfileView = this.viewManager.getView(Views.SET_PROFILE);
    if (setProfileView instanceof SetProfileView) {
      setProfileView.onProfileSetupCompleted = () => {
        this.viewManager.navigateToView(Views.KEYS);
      };

      setProfileView.onProfileEditCompleted = () => {
        this.viewManager.navigateToView(Views.HOME);
      };
    }

    const keysView = this.viewManager.getView(Views.KEYS);
    if (keysView instanceof KeysView) {
      keysView.onKeysOkCompleted = () => {
        this.viewManager.navigateToView(Views.HOME);
      };
    }

    const toolbarView = this.viewManager.getView(Views.TOOLBAR);
    if (toolbarView instanceof ToolbarView) {
      toolbarView.onHomeOptionEvent = () => {
        this.viewManager.navigateToView(Views.HOME);
      }

      toolbarView.onProfileOptionEvent = () => {
        this.viewManager.navigateToView(Views.SET_PROFILE);
      }

      toolbarView.onKeysOptionEvent = () => {
        this.viewManager.navigateToView(Views.KEYS);
      }

      toolbarView.OnFaqOptionEvent = () => {
        this.viewManager.navigateToView(Views.FAQ);
      }

      toolbarView.OnAboutOptionEvent = () => {
        this.viewManager.navigateToView(Views.ABOUT);
      }

      toolbarView.onSettingsOptionEvent = () => {
        this.viewManager.navigateToView(Views.SETTINGS);
      }

      toolbarView.onSignOutOptionEvent = async () => {
        await browser.runtime.sendMessage({ action: actions.SIGN_OUT_SESSION });
        window.close();
      }
    }

    const homeView = this.viewManager.getView(Views.HOME);
    if (homeView instanceof HomeView) {
    }
  }
}


type ViewId = typeof Views[keyof typeof Views];

const Views = {
  ACCOUNT: 'account-view',
  IMPORT_ACCOUNT: 'import-account-view',
  KEYS: 'keys-view',
  HOME: 'home-view',
  SET_PROFILE: 'set-profile-view',
  SETTINGS: 'settings-view',
  FAQ: 'faq-view',
  ABOUT: 'about-view',
  TOOLBAR: 'toolbar'
} as const;






