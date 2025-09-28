/**
 * Worker Pool - Manages parallel task execution
 */

export class WorkerPool {
  private maxWorkers: number;
  private activeWorkers: number = 0;
  private taskQueue: Array<{task: Function, resolve: Function, reject: Function}> = [];
  private results: Map<string, any> = new Map();
  
  constructor(maxWorkers: number = 10) {
    this.maxWorkers = maxWorkers;
  }
  
  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ task, resolve, reject });
      this.processQueue();
    });
  }
  
  private async processQueue() {
    while (this.taskQueue.length > 0 && this.activeWorkers < this.maxWorkers) {
      const item = this.taskQueue.shift();
      if (!item) continue;
      
      this.activeWorkers++;
      
      item.task()
        .then(result => {
          item.resolve(result);
          this.activeWorkers--;
          this.processQueue();
        })
        .catch(error => {
          item.reject(error);
          this.activeWorkers--;
          this.processQueue();
        });
    }
  }
  
  async executeMany<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(tasks.map(task => this.execute(task)));
  }
  
  getStats() {
    return {
      activeWorkers: this.activeWorkers,
      queuedTasks: this.taskQueue.length,
      maxWorkers: this.maxWorkers
    };
  }
  
  async shutdown() {
    // Wait for all tasks to complete
    while (this.activeWorkers > 0 || this.taskQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}