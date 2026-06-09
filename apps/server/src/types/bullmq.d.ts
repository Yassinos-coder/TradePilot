declare module 'bullmq' {
  export type JobState =
    | 'completed'
    | 'failed'
    | 'delayed'
    | 'active'
    | 'waiting'
    | 'waiting-children'
    | 'prioritized'
    | 'paused'
    | 'stuck'
    | 'unknown';

  export interface Job<DataType = unknown, ReturnType = unknown, NameType extends string = string> {
    id?: string;
    name: NameType;
    data: DataType;
    returnvalue: ReturnType;
    attemptsMade: number;
    repeatJobKey?: string;
    opts: { delay?: number } & Record<string, unknown>;
    promote(): Promise<void>;
    remove(): Promise<void>;
    retry(state?: 'completed' | 'failed'): Promise<void>;
    toJSON(): any;
    getState(): Promise<JobState>;
    update?(jobData: Record<string, unknown>): Promise<void>;
    updateData?(jobData: Record<string, unknown>): Promise<void>;
  }

  export interface Queue<DataType = unknown, ResultType = unknown, NameType extends string = string> {
    add(name: NameType, data: DataType, opts?: Record<string, unknown>): Promise<Job<DataType, ResultType, NameType>>;
  }
}
