declare interface ZenPayOptions {
    key: string;
    onSuccess: (res: any) => void;
    onFailure: (err: any) => void;
}

declare interface ZenPayOpenOptions {
    order_id: string;
}

declare class ZenPay {
    constructor(options: ZenPayOptions);
    open(options: ZenPayOpenOptions): void;
}

interface Window {
    ZenPay: typeof ZenPay;
}
