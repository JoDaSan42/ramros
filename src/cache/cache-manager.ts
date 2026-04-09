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

export class CacheManager implements vscode.Disposable {
  private readonly memoryCache = new Map<CacheKey, CacheEntry<unknown>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000;
  private readonly MAX_CACHE_SIZE = 1000;
  
  private stats: CacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    evictions: 0
  };
  
  private watcher?: vscode.FileSystemWatcher;
  private readonly disposables: vscode.Disposable[] = [];
  
  constructor(private readonly onFileChange?: (path: string) => void) {
    this.setupFileSystemWatcher();
  }
  
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
    
    this.stats.hits++;
    this.updateStats();
    return entry.data as T;
  }
  
  async set<T>(key: CacheKey, data: T, dependencies: vscode.Uri[] = []): Promise<void> {
    if (this.memoryCache.size >= this.MAX_CACHE_SIZE) {
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
      dependencies: dependencies.map(uri => uri.fsPath)
    });
    
    this.updateStats();
  }
  
  invalidate(path: string): void {
    const normalizedPath = path.replace(/\\/g, '/');
    let invalidatedCount = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      const matchesDependency = entry.dependencies.some(dep => 
        dep === normalizedPath || dep.startsWith(normalizedPath + '/') ||
        normalizedPath.includes(dep)
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
