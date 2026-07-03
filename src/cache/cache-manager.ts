import * as vscode from 'vscode';

export type CacheKey = string;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  dependencies: string[];
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface CacheManagerOptions {
  ttl?: number;
  maxCacheSize?: number;
  onFileChange?: (path: string) => void;
}

export class CacheManager implements vscode.Disposable {
  private readonly memoryCache = new Map<CacheKey, CacheEntry<unknown>>();
  public DEFAULT_TTL: number;
  public MAX_CACHE_SIZE: number;
  
  private stats: CacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    evictions: 0
  };
  
  private watcher?: vscode.FileSystemWatcher;
  private readonly disposables: vscode.Disposable[] = [];
  
  constructor(options?: CacheManagerOptions) {
    let configTtl = 300;
    let configMaxEntries = 1000;
    try {
      const config = vscode.workspace.getConfiguration('ramros.cache');
      configTtl = config.get<number>('ttlSeconds', 300);
      configMaxEntries = config.get<number>('maxEntries', 1000);
    } catch {
      // VSCode API not available (e.g., in unit tests)
    }
    this.DEFAULT_TTL = options?.ttl ?? configTtl * 1000;
    this.MAX_CACHE_SIZE = options?.maxCacheSize ?? configMaxEntries;
    this.onFileChange = options?.onFileChange;
    this.setupFileSystemWatcher();
  }
  
  private onFileChange?: (path: string) => void;
  
  async get<T>(key: CacheKey): Promise<T | null> {
    const entry = this.memoryCache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.memoryCache.delete(key);
      this.stats.misses++;
      this.updateStats();
      return null;
    }
    
    // LRU: re-insert to move to end (most recently used)
    this.memoryCache.delete(key);
    this.memoryCache.set(key, entry);
    
    this.stats.hits++;
    this.updateStats();
    return entry.data as T;
  }
  
  async set<T>(key: CacheKey, data: T, dependencies: vscode.Uri[] = []): Promise<void> {
    if (this.memoryCache.size >= this.MAX_CACHE_SIZE && !this.memoryCache.has(key)) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
        this.stats.evictions++;
      }
    }
    
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: this.DEFAULT_TTL,
      dependencies: dependencies.map(uri => uri.fsPath.replace(/\\/g, '/'))
    });
    
    this.updateStats();
  }
  
  invalidate(path: string): void {
    const normalizedPath = path.replace(/\\/g, '/');
    let invalidatedCount = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      const matchesDependency = entry.dependencies.some(dep => 
        dep === normalizedPath ||
        dep.startsWith(normalizedPath + '/') ||
        normalizedPath.startsWith(dep + '/')
      );
      
      if (matchesDependency) {
        this.memoryCache.delete(key);
        invalidatedCount++;
      }
    }
    
    if (invalidatedCount > 0 && this.onFileChange) {
      this.onFileChange(`Invalidated ${invalidatedCount} cache entries`);
    }
  }
  
  clearByPrefix(prefix: string): void {
    for (const key of [...this.memoryCache.keys()]) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }
    this.updateStats();
  }
  
  clear(): void {
    this.memoryCache.clear();
    this.updateStats();
  }
  
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  dispose(): void {
    if (this.watcher) {
      this.watcher.dispose();
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
  
  private setupFileSystemWatcher(): void {
    this.watcher = vscode.workspace.createFileSystemWatcher(
      '**/{package.xml,CMakeLists.txt,setup.py}',
      false,
      false,
      false
    );
    
    this.watcher.onDidChange(uri => this.handleFileChange(uri));
    this.watcher.onDidCreate(uri => this.handleFileChange(uri));
    this.watcher.onDidDelete(uri => this.handleFileChange(uri));
  }
  
  private handleFileChange(uri: vscode.Uri): void {
    this.invalidate(uri.fsPath);
    
    if (uri.path.includes('package.xml') || 
        uri.path.includes('CMakeLists.txt') ||
        uri.path.includes('setup.py')) {
      const workspaceRoot = this.getWorkspaceRoot(uri);
      if (workspaceRoot) {
        this.invalidate(workspaceRoot);
      }
    }
  }
  
  private getWorkspaceRoot(uri: vscode.Uri): string | null {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    return workspaceFolder ? workspaceFolder.uri.fsPath : null;
  }
  
  private updateStats(): void {
    this.stats.size = this.memoryCache.size;
  }
}
