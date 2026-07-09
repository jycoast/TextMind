export namespace extract {
	
	export class Options {
	    mode: string;
	    pattern: string;
	    useRegex: boolean;
	    caseInsensitive: boolean;
	    invert: boolean;
	    dedup: boolean;
	    captureGroup: number;
	    joiner: string;
	    blockEnd: string;
	    includeBoundary: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Options(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.pattern = source["pattern"];
	        this.useRegex = source["useRegex"];
	        this.caseInsensitive = source["caseInsensitive"];
	        this.invert = source["invert"];
	        this.dedup = source["dedup"];
	        this.captureGroup = source["captureGroup"];
	        this.joiner = source["joiner"];
	        this.blockEnd = source["blockEnd"];
	        this.includeBoundary = source["includeBoundary"];
	    }
	}

}

export namespace main {
	
	export class AIConfigDTO {
	    baseUrl: string;
	    apiKey: string;
	    defaultModel: string;
	    models: string[];
	    systemPrompt: string;
	
	    static createFrom(source: any = {}) {
	        return new AIConfigDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.defaultModel = source["defaultModel"];
	        this.models = source["models"];
	        this.systemPrompt = source["systemPrompt"];
	    }
	}
	export class AIModelDTO {
	    id: string;
	    ownedBy?: string;
	    created?: number;
	
	    static createFrom(source: any = {}) {
	        return new AIModelDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.ownedBy = source["ownedBy"];
	        this.created = source["created"];
	    }
	}
	export class COSConfigDTO {
	    secretId: string;
	    secretKey: string;
	    region: string;
	    bucket: string;
	    keyPrefix: string;
	    customDomain: string;
	
	    static createFrom(source: any = {}) {
	        return new COSConfigDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.secretId = source["secretId"];
	        this.secretKey = source["secretKey"];
	        this.region = source["region"];
	        this.bucket = source["bucket"];
	        this.keyPrefix = source["keyPrefix"];
	        this.customDomain = source["customDomain"];
	    }
	}
	export class COSUploadResult {
	    url: string;
	    key: string;
	    contentType?: string;
	    size?: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new COSUploadResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.key = source["key"];
	        this.contentType = source["contentType"];
	        this.size = source["size"];
	        this.error = source["error"];
	    }
	}
	export class ChatMessageDTO {
	    role: string;
	    content: string;
	    createdAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new ChatMessageDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class ConversationDTO {
	    id: string;
	    title: string;
	    model?: string;
	    createdAt: number;
	    updatedAt: number;
	    messages: ChatMessageDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ConversationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.model = source["model"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.messages = this.convertValues(source["messages"], ChatMessageDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConversationMetaDTO {
	    id: string;
	    title: string;
	    model?: string;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new ConversationMetaDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.model = source["model"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class ConversationListDTO {
	    conversations: ConversationMetaDTO[];
	    selectedId: string;
	
	    static createFrom(source: any = {}) {
	        return new ConversationListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.conversations = this.convertValues(source["conversations"], ConversationMetaDTO);
	        this.selectedId = source["selectedId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ExtractResult {
	    text: string;
	    matchCount: number;
	    lineCount: number;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ExtractResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text = source["text"];
	        this.matchCount = source["matchCount"];
	        this.lineCount = source["lineCount"];
	        this.error = source["error"];
	    }
	}
	export class FetchModelsResult {
	    ok: boolean;
	    error?: string;
	    models: AIModelDTO[];
	
	    static createFrom(source: any = {}) {
	        return new FetchModelsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.models = this.convertValues(source["models"], AIModelDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FileChangeInfo {
	    path: string;
	    modTime: number;
	
	    static createFrom(source: any = {}) {
	        return new FileChangeInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.modTime = source["modTime"];
	    }
	}
	export class FileEntry {
	    name: string;
	    path: string;
	    relative: string;
	
	    static createFrom(source: any = {}) {
	        return new FileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.relative = source["relative"];
	    }
	}
	export class FolderEntry {
	    name: string;
	    path: string;
	    isDir: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FolderEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	    }
	}
	export class InstallUpdateRequest {
	    assetUrl: string;
	    assetName: string;
	
	    static createFrom(source: any = {}) {
	        return new InstallUpdateRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.assetUrl = source["assetUrl"];
	        this.assetName = source["assetName"];
	    }
	}
	export class KeymapConfigDTO {
	    bindings: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new KeymapConfigDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.bindings = source["bindings"];
	    }
	}
	export class ListFilesResult {
	    files: FileEntry[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ListFilesResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = this.convertValues(source["files"], FileEntry);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ListFolderResult {
	    path: string;
	    entries: FolderEntry[];
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ListFolderResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.entries = this.convertValues(source["entries"], FolderEntry);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OpenFileResult {
	    name: string;
	    path: string;
	    text: string;
	    encoding: string;
	    hasBOM: boolean;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new OpenFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.text = source["text"];
	        this.encoding = source["encoding"];
	        this.hasBOM = source["hasBOM"];
	        this.error = source["error"];
	    }
	}
	export class OpenFolderResult {
	    path: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new OpenFolderResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.error = source["error"];
	    }
	}
	export class PluginCallResult {
	    ok: boolean;
	    error?: string;
	    result?: any;
	
	    static createFrom(source: any = {}) {
	        return new PluginCallResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.result = source["result"];
	    }
	}
	export class PluginManifestDTO {
	    id: string;
	    name: string;
	    version: string;
	    description?: string;
	    author?: string;
	    entryUrl?: string;
	    entry?: string;
	    permissions?: string[];
	    activationEvents?: string[];
	    builtin: boolean;
	    enabled: boolean;
	    installPath?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PluginManifestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.version = source["version"];
	        this.description = source["description"];
	        this.author = source["author"];
	        this.entryUrl = source["entryUrl"];
	        this.entry = source["entry"];
	        this.permissions = source["permissions"];
	        this.activationEvents = source["activationEvents"];
	        this.builtin = source["builtin"];
	        this.enabled = source["enabled"];
	        this.installPath = source["installPath"];
	        this.error = source["error"];
	    }
	}
	export class PluginListDTO {
	    plugins: PluginManifestDTO[];
	    root: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PluginListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.plugins = this.convertValues(source["plugins"], PluginManifestDTO);
	        this.root = source["root"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SaveFileResult {
	    name: string;
	    path: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.error = source["error"];
	    }
	}
	export class SearchMatch {
	    path: string;
	    relative: string;
	    line: number;
	    column: number;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new SearchMatch(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.relative = source["relative"];
	        this.line = source["line"];
	        this.column = source["column"];
	        this.text = source["text"];
	    }
	}
	export class SearchOptions {
	    query: string;
	    root: string;
	    caseSensitive: boolean;
	    useRegex: boolean;
	    wholeWord: boolean;
	    includePattern: string;
	    excludePattern: string;
	    maxResults: number;
	
	    static createFrom(source: any = {}) {
	        return new SearchOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.query = source["query"];
	        this.root = source["root"];
	        this.caseSensitive = source["caseSensitive"];
	        this.useRegex = source["useRegex"];
	        this.wholeWord = source["wholeWord"];
	        this.includePattern = source["includePattern"];
	        this.excludePattern = source["excludePattern"];
	        this.maxResults = source["maxResults"];
	    }
	}
	export class SearchResult {
	    matches: SearchMatch[];
	    totalFiles: number;
	    error?: string;
	    truncated: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SearchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.matches = this.convertValues(source["matches"], SearchMatch);
	        this.totalFiles = source["totalFiles"];
	        this.error = source["error"];
	        this.truncated = source["truncated"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SessionPayload {
	    nextTabSeq: number;
	    selectedIndex: number;
	    tabs: persist.TabSnapshot[];
	    recentFiles: persist.RecentFile[];
	    workspaceRoot: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nextTabSeq = source["nextTabSeq"];
	        this.selectedIndex = source["selectedIndex"];
	        this.tabs = this.convertValues(source["tabs"], persist.TabSnapshot);
	        this.recentFiles = this.convertValues(source["recentFiles"], persist.RecentFile);
	        this.workspaceRoot = source["workspaceRoot"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SimpleResult {
	    ok: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new SimpleResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	    }
	}
	export class StartChatRequest {
	    messages: ChatMessageDTO[];
	    conversationId?: string;
	    userMessage?: string;
	    model?: string;
	
	    static createFrom(source: any = {}) {
	        return new StartChatRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.messages = this.convertValues(source["messages"], ChatMessageDTO);
	        this.conversationId = source["conversationId"];
	        this.userMessage = source["userMessage"];
	        this.model = source["model"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StartChatResult {
	    streamId?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new StartChatResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.streamId = source["streamId"];
	        this.error = source["error"];
	    }
	}
	export class ToolResult {
	    text: string;
	    removed: number;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new ToolResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text = source["text"];
	        this.removed = source["removed"];
	        this.count = source["count"];
	    }
	}
	export class UpdateAssetDTO {
	    name: string;
	    url: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new UpdateAssetDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.url = source["url"];
	        this.size = source["size"];
	    }
	}
	export class UpdateInfoDTO {
	    ok: boolean;
	    error?: string;
	    currentVersion: string;
	    latestVersion?: string;
	    hasUpdate: boolean;
	    releaseName?: string;
	    releaseNotes?: string;
	    releaseUrl?: string;
	    publishedAt?: string;
	    asset?: UpdateAssetDTO;
	    canAutoInstall: boolean;
	    platform: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.hasUpdate = source["hasUpdate"];
	        this.releaseName = source["releaseName"];
	        this.releaseNotes = source["releaseNotes"];
	        this.releaseUrl = source["releaseUrl"];
	        this.publishedAt = source["publishedAt"];
	        this.asset = this.convertValues(source["asset"], UpdateAssetDTO);
	        this.canAutoInstall = source["canAutoInstall"];
	        this.platform = source["platform"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace persist {
	
	export class RecentFile {
	    path: string;
	    name: string;
	    language?: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.language = source["language"];
	    }
	}
	export class TabSnapshot {
	    title: string;
	    text: string;
	    language?: string;
	    path?: string;
	    dirty?: boolean;
	    encoding?: string;
	    hasBOM?: boolean;
	    viewState?: number[];
	    editorId?: string;
	
	    static createFrom(source: any = {}) {
	        return new TabSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.text = source["text"];
	        this.language = source["language"];
	        this.path = source["path"];
	        this.dirty = source["dirty"];
	        this.encoding = source["encoding"];
	        this.hasBOM = source["hasBOM"];
	        this.viewState = source["viewState"];
	        this.editorId = source["editorId"];
	    }
	}

}

export namespace textcodec {
	
	export class EncodingMeta {
	    id: string;
	    label: string;
	    group: string;
	
	    static createFrom(source: any = {}) {
	        return new EncodingMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.group = source["group"];
	    }
	}

}

