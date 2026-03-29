"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const outline_1 = require("@heroicons/react/24/outline");
const i18n_1 = require("../i18n");
const service_1 = require("../service");
const SKILL_ID = 'imap-smtp-email';
const PROVIDER_PRESETS = {
    gmail: {
        label: 'Gmail',
        imapHost: 'imap.gmail.com',
        imapPort: '993',
        smtpHost: 'smtp.gmail.com',
        smtpPort: '587',
        smtpSecure: 'false',
        hint: 'emailHintGmail',
    },
    outlook: {
        label: 'Outlook',
        imapHost: 'outlook.office365.com',
        imapPort: '993',
        smtpHost: 'smtp.office365.com',
        smtpPort: '587',
        smtpSecure: 'false',
    },
    '163': {
        label: '163.com',
        imapHost: 'imap.163.com',
        imapPort: '993',
        smtpHost: 'smtp.163.com',
        smtpPort: '465',
        smtpSecure: 'true',
        hint: 'emailHint163',
    },
    '126': {
        label: '126.com',
        imapHost: 'imap.126.com',
        imapPort: '993',
        smtpHost: 'smtp.126.com',
        smtpPort: '465',
        smtpSecure: 'true',
        hint: 'emailHint163',
    },
    qq: {
        label: 'QQ Mail',
        imapHost: 'imap.qq.com',
        imapPort: '993',
        smtpHost: 'smtp.qq.com',
        smtpPort: '587',
        smtpSecure: 'false',
        hint: 'emailHintQQ',
    },
    custom: {
        label: '',
        imapHost: '',
        imapPort: '993',
        smtpHost: '',
        smtpPort: '587',
        smtpSecure: 'false',
    },
};
const detectProvider = (config) => {
    const imapHost = (config.IMAP_HOST || '').toLowerCase();
    if (imapHost.includes('gmail'))
        return 'gmail';
    if (imapHost.includes('outlook') || imapHost.includes('office365'))
        return 'outlook';
    if (imapHost === 'imap.163.com')
        return '163';
    if (imapHost === 'imap.126.com')
        return '126';
    if (imapHost.includes('qq.com'))
        return 'qq';
    if (imapHost)
        return 'custom';
    return '';
};
const normalizeConfig = (config) => ({
    IMAP_HOST: config.IMAP_HOST ?? '',
    IMAP_PORT: config.IMAP_PORT ?? '993',
    IMAP_USER: config.IMAP_USER ?? '',
    IMAP_PASS: config.IMAP_PASS ?? '',
    IMAP_TLS: config.IMAP_TLS ?? 'true',
    IMAP_REJECT_UNAUTHORIZED: config.IMAP_REJECT_UNAUTHORIZED ?? 'true',
    IMAP_MAILBOX: config.IMAP_MAILBOX ?? 'INBOX',
    SMTP_HOST: config.SMTP_HOST ?? '',
    SMTP_PORT: config.SMTP_PORT ?? '587',
    SMTP_SECURE: config.SMTP_SECURE ?? 'false',
    SMTP_USER: config.SMTP_USER ?? '',
    SMTP_PASS: config.SMTP_PASS ?? '',
    SMTP_FROM: config.SMTP_FROM ?? '',
    SMTP_REJECT_UNAUTHORIZED: config.SMTP_REJECT_UNAUTHORIZED ?? 'true',
});
const configsEqual = (a, b) => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
        if ((a[key] ?? '') !== (b[key] ?? '')) {
            return false;
        }
    }
    return true;
};
const EmailSkillConfig = ({ onClose }) => {
    const [provider, setProvider] = (0, react_1.useState)('');
    const [email, setEmail] = (0, react_1.useState)('');
    const [password, setPassword] = (0, react_1.useState)('');
    const [showAdvanced, setShowAdvanced] = (0, react_1.useState)(false);
    const [imapHost, setImapHost] = (0, react_1.useState)('');
    const [imapPort, setImapPort] = (0, react_1.useState)('993');
    const [smtpHost, setSmtpHost] = (0, react_1.useState)('');
    const [smtpPort, setSmtpPort] = (0, react_1.useState)('587');
    const [smtpSecure, setSmtpSecure] = (0, react_1.useState)('false');
    const [imapTls, setImapTls] = (0, react_1.useState)('true');
    const [mailbox, setMailbox] = (0, react_1.useState)('INBOX');
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [isPersisting, setIsPersisting] = (0, react_1.useState)(false);
    const [showPersisting, setShowPersisting] = (0, react_1.useState)(false);
    const [persistError, setPersistError] = (0, react_1.useState)(null);
    const [isTesting, setIsTesting] = (0, react_1.useState)(false);
    const [connectivityResult, setConnectivityResult] = (0, react_1.useState)(null);
    const [connectivityError, setConnectivityError] = (0, react_1.useState)(null);
    const isMountedRef = (0, react_1.useRef)(true);
    const persistInFlightRef = (0, react_1.useRef)(false);
    const persistQueuedRef = (0, react_1.useRef)(false);
    const latestConfigRef = (0, react_1.useRef)(normalizeConfig({}));
    const lastPersistedConfigRef = (0, react_1.useRef)(normalizeConfig({}));
    const persistIndicatorTimerRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const loadConfig = async () => {
            const config = await service_1.skillService.getSkillConfig(SKILL_ID);
            if (config.IMAP_USER)
                setEmail(config.IMAP_USER);
            if (config.IMAP_PASS)
                setPassword(config.IMAP_PASS);
            if (config.IMAP_HOST)
                setImapHost(config.IMAP_HOST);
            if (config.IMAP_PORT)
                setImapPort(config.IMAP_PORT);
            if (config.SMTP_HOST)
                setSmtpHost(config.SMTP_HOST);
            if (config.SMTP_PORT)
                setSmtpPort(config.SMTP_PORT);
            if (config.SMTP_SECURE)
                setSmtpSecure(config.SMTP_SECURE);
            if (config.IMAP_TLS)
                setImapTls(config.IMAP_TLS);
            if (config.IMAP_MAILBOX)
                setMailbox(config.IMAP_MAILBOX);
            const detected = detectProvider(config);
            if (detected)
                setProvider(detected);
            const normalized = normalizeConfig(config);
            latestConfigRef.current = normalized;
            lastPersistedConfigRef.current = normalized;
            setLoading(false);
        };
        loadConfig();
    }, []);
    (0, react_1.useEffect)(() => {
        return () => {
            isMountedRef.current = false;
            if (persistIndicatorTimerRef.current != null) {
                window.clearTimeout(persistIndicatorTimerRef.current);
            }
        };
    }, []);
    const buildConfig = (0, react_1.useCallback)(() => ({
        IMAP_HOST: imapHost,
        IMAP_PORT: imapPort,
        IMAP_USER: email,
        IMAP_PASS: password,
        IMAP_TLS: imapTls,
        IMAP_REJECT_UNAUTHORIZED: 'true',
        IMAP_MAILBOX: mailbox,
        SMTP_HOST: smtpHost,
        SMTP_PORT: smtpPort,
        SMTP_SECURE: smtpSecure,
        SMTP_USER: email,
        SMTP_PASS: password,
        SMTP_FROM: email,
        SMTP_REJECT_UNAUTHORIZED: 'true',
    }), [
        email,
        imapHost,
        imapPort,
        imapTls,
        mailbox,
        password,
        smtpHost,
        smtpPort,
        smtpSecure,
    ]);
    (0, react_1.useEffect)(() => {
        latestConfigRef.current = buildConfig();
    }, [buildConfig]);
    const flushPersistQueue = (0, react_1.useCallback)(async () => {
        if (persistInFlightRef.current) {
            return;
        }
        persistInFlightRef.current = true;
        if (isMountedRef.current) {
            setIsPersisting(true);
            if (persistIndicatorTimerRef.current != null) {
                window.clearTimeout(persistIndicatorTimerRef.current);
            }
            persistIndicatorTimerRef.current = window.setTimeout(() => {
                if (isMountedRef.current && persistInFlightRef.current) {
                    setShowPersisting(true);
                }
            }, 160);
        }
        while (persistQueuedRef.current) {
            persistQueuedRef.current = false;
            const configToPersist = latestConfigRef.current;
            const success = await service_1.skillService.setSkillConfig(SKILL_ID, configToPersist);
            if (!isMountedRef.current) {
                continue;
            }
            if (success) {
                lastPersistedConfigRef.current = configToPersist;
                setPersistError(null);
            }
            else {
                setPersistError(i18n_1.skillI18n.t('emailConfigError'));
            }
        }
        persistInFlightRef.current = false;
        if (isMountedRef.current) {
            setIsPersisting(false);
            setShowPersisting(false);
            if (persistIndicatorTimerRef.current != null) {
                window.clearTimeout(persistIndicatorTimerRef.current);
                persistIndicatorTimerRef.current = null;
            }
        }
    }, []);
    const queuePersist = (0, react_1.useCallback)(() => {
        const nextConfig = buildConfig();
        latestConfigRef.current = nextConfig;
        if (configsEqual(nextConfig, lastPersistedConfigRef.current)) {
            return;
        }
        persistQueuedRef.current = true;
        void flushPersistQueue();
    }, [buildConfig, flushPersistQueue]);
    const handleProviderChange = (newProvider) => {
        setProvider(newProvider);
        if (newProvider && newProvider !== 'custom') {
            const preset = PROVIDER_PRESETS[newProvider];
            if (preset) {
                setImapHost(preset.imapHost);
                setImapPort(preset.imapPort);
                setSmtpHost(preset.smtpHost);
                setSmtpPort(preset.smtpPort);
                setSmtpSecure(preset.smtpSecure);
                setImapTls('true');
            }
            return;
        }
        if (newProvider === 'custom') {
            const customPreset = PROVIDER_PRESETS.custom;
            setImapHost(customPreset.imapHost);
            setImapPort(customPreset.imapPort);
            setSmtpHost(customPreset.smtpHost);
            setSmtpPort(customPreset.smtpPort);
            setSmtpSecure(customPreset.smtpSecure);
            setImapTls('true');
        }
    };
    const handleConnectivityTest = async () => {
        setConnectivityError(null);
        setConnectivityResult(null);
        setIsTesting(true);
        const result = await service_1.skillService.testEmailConnectivity(SKILL_ID, buildConfig());
        if (result) {
            setConnectivityResult(result);
        }
        else {
            setConnectivityError(i18n_1.skillI18n.t('connectionFailed'));
        }
        setIsTesting(false);
    };
    const currentPreset = provider ? PROVIDER_PRESETS[provider] : null;
    const hintKey = currentPreset?.hint;
    const canTest = Boolean(email && password && imapHost && smtpHost);
    const connectivityPassed = connectivityResult?.verdict === 'pass';
    const inputClassName = 'block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs';
    const labelClassName = 'block text-xs font-medium dark:text-claude-darkText text-claude-text mb-1';
    if (loading) {
        return (<div className="p-4 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
        {i18n_1.skillI18n.t('loading')}...
      </div>);
    }
    return (<div className="space-y-4 p-4 rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/30 bg-claude-surface/30">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium dark:text-claude-darkText text-claude-text">
          {i18n_1.skillI18n.t('emailConfig')}
        </h4>
        {onClose && (<button type="button" onClick={onClose} className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-accent transition-colors">
            {i18n_1.skillI18n.t('collapse')}
          </button>)}
      </div>
      <div className="min-h-[18px]">
        {(persistError || (isPersisting && showPersisting)) && (<div className={`text-xs ${persistError ? 'text-red-600 dark:text-red-400' : 'text-claude-textSecondary dark:text-claude-darkTextSecondary'}`}>
            {persistError || `${i18n_1.skillI18n.t('saving')}...`}
          </div>)}
      </div>

      
      <div>
        <label className={labelClassName}>{i18n_1.skillI18n.t('emailProvider')}</label>
        <select value={provider} onChange={(e) => handleProviderChange(e.target.value)} onBlur={queuePersist} className={inputClassName}>
          <option value="">{i18n_1.skillI18n.t('emailSelectProvider')}</option>
          {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (<option key={key} value={key}>
              {key === 'custom' ? i18n_1.skillI18n.t('emailCustomProvider') : preset.label}
            </option>))}
        </select>
      </div>

      
      {hintKey && (<div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
          {i18n_1.skillI18n.t(hintKey)}
        </div>)}

      
      <div>
        <label className={labelClassName}>{i18n_1.skillI18n.t('emailAddress')}</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={queuePersist} className={inputClassName} placeholder="your@email.com"/>
      </div>

      
      <div>
        <label className={labelClassName}>{i18n_1.skillI18n.t('emailPassword')}</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onBlur={queuePersist} className={inputClassName} placeholder={i18n_1.skillI18n.t('emailPasswordPlaceholder')}/>
      </div>

      
      <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-accent transition-colors">
        {showAdvanced ? (<outline_1.ChevronUpIcon className="h-3.5 w-3.5"/>) : (<outline_1.ChevronDownIcon className="h-3.5 w-3.5"/>)}
        {i18n_1.skillI18n.t('emailAdvancedSettings')}
      </button>

      
      {showAdvanced && (<div className="space-y-3 pl-2 border-l-2 border-claude-border dark:border-claude-darkBorder">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClassName}>IMAP Host</label>
              <input type="text" value={imapHost} onChange={(e) => setImapHost(e.target.value)} onBlur={queuePersist} className={inputClassName} placeholder="imap.example.com"/>
            </div>
            <div>
              <label className={labelClassName}>IMAP Port</label>
              <input type="text" value={imapPort} onChange={(e) => setImapPort(e.target.value)} onBlur={queuePersist} className={inputClassName} placeholder="993"/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClassName}>SMTP Host</label>
              <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} onBlur={queuePersist} className={inputClassName} placeholder="smtp.example.com"/>
            </div>
            <div>
              <label className={labelClassName}>SMTP Port</label>
              <input type="text" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} onBlur={queuePersist} className={inputClassName} placeholder="587"/>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs dark:text-claude-darkText text-claude-text">
              <input type="checkbox" checked={imapTls === 'true'} onChange={(e) => setImapTls(e.target.checked ? 'true' : 'false')} onBlur={queuePersist} className="h-3.5 w-3.5 text-claude-accent focus:ring-claude-accent rounded"/>
              IMAP TLS
            </label>
            <label className="flex items-center gap-2 text-xs dark:text-claude-darkText text-claude-text">
              <input type="checkbox" checked={smtpSecure === 'true'} onChange={(e) => setSmtpSecure(e.target.checked ? 'true' : 'false')} onBlur={queuePersist} className="h-3.5 w-3.5 text-claude-accent focus:ring-claude-accent rounded"/>
              SMTP SSL
            </label>
          </div>

          <div>
            <label className={labelClassName}>{i18n_1.skillI18n.t('emailMailbox')}</label>
            <input type="text" value={mailbox} onChange={(e) => setMailbox(e.target.value)} onBlur={queuePersist} className={inputClassName} placeholder="INBOX"/>
          </div>
        </div>)}

      
      <div className="space-y-3 pt-1">
        <button type="button" onClick={handleConnectivityTest} disabled={isTesting || !canTest} className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-xl border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]">
          <outline_1.SignalIcon className="h-3.5 w-3.5 mr-1.5"/>
          {isTesting ? i18n_1.skillI18n.t('imConnectivityTesting') : i18n_1.skillI18n.t('imConnectivityTest')}
        </button>

        {connectivityError && (<div className="text-xs text-red-600 dark:text-red-400">
            {connectivityError}
          </div>)}

        {connectivityResult && (<div className="space-y-2">
            <div className={`flex items-center gap-1 text-xs ${connectivityPassed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {connectivityPassed ? (<outline_1.CheckCircleIcon className="h-4 w-4"/>) : (<outline_1.XCircleIcon className="h-4 w-4"/>)}
              <span>
                {connectivityPassed ? i18n_1.skillI18n.t('connectionSuccess') : i18n_1.skillI18n.t('connectionFailed')}
              </span>
              <span className="text-[11px] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {new Date(connectivityResult.testedAt).toLocaleString()}
              </span>
            </div>
            <div className="space-y-1.5">
              {connectivityResult.checks.map((check) => {
                const checkPassed = check.level === 'pass';
                const checkLabel = check.code === 'imap_connection' ? 'IMAP' : 'SMTP';
                return (<div key={check.code} className="rounded-lg border dark:border-claude-darkBorder/60 border-claude-border/60 px-2.5 py-2 dark:bg-claude-darkSurface/25 bg-white/70">
                    <div className={`flex items-center gap-1 text-xs font-medium ${checkPassed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {checkPassed ? (<outline_1.CheckCircleIcon className="h-3.5 w-3.5"/>) : (<outline_1.XCircleIcon className="h-3.5 w-3.5"/>)}
                      <span>{checkLabel}</span>
                    </div>
                    <div className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {check.message}
                    </div>
                    <div className="mt-1 text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {`${check.durationMs}ms`}
                    </div>
                  </div>);
            })}
            </div>
          </div>)}
      </div>
    </div>);
};
exports.default = EmailSkillConfig;
//# sourceMappingURL=EmailSkillConfig.js.map