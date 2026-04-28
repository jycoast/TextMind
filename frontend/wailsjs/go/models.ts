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
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new OpenFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.text = source["text"];
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
	    }
	}

}

