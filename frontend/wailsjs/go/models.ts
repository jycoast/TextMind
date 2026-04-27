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

