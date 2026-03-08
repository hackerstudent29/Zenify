var ZenWallet = (function () {
    "use strict";
    class ZenWallet {
        constructor(options) {
            this.options = { ...options };
            this.iframeInfo = null;
            this._setupMessageListener();
        }
        _setupMessageListener() {
            window.addEventListener("message", (event) => {
                if (!event.data || event.data.source !== "zenwallet-checkout") return;
                const { type, payload } = event.data;
                switch (type) {
                    case "PAYMENT_SUCCESS":
                        if (this.options.onSuccess) this.options.onSuccess(payload);
                        else if (this.options.handler) this.options.handler(payload);
                        this.close();
                        break;
                    case "PAYMENT_FAILED":
                        if (this.options.onFailure) this.options.onFailure(payload);
                        break;
                    case "MODAL_CLOSE":
                        if (this.options.onFailure) this.options.onFailure({ message: 'cancelled', error: 'user_cancelled' });
                        this.close();
                        break;
                }
            });
        }
        open(options) {
            const orderId = options?.order_id || this.options.order_id;
            if (!orderId) throw new Error("ZenWallet: order_id is required");
            const iframe = document.createElement("iframe");
            const baseUrl = this.options.checkoutUrl || "https://zenpay-jshp.onrender.com/checkout/";
            const params = new URLSearchParams({
                key: this.options.key,
                order_id: orderId,
                name: options?.name || this.options.name || ""
            });
            iframe.src = `${baseUrl}?${params.toString()}`;
            iframe.style.position = "fixed";
            iframe.style.top = "0";
            iframe.style.left = "0";
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.border = "none";
            iframe.style.zIndex = "999999";
            iframe.style.background = "transparent";
            iframe.allow = "payment";
            document.body.appendChild(iframe);
            document.body.style.overflow = "hidden";
            this.iframeInfo = iframe;
        }
        close() {
            if (this.iframeInfo) {
                this.iframeInfo.remove();
                this.iframeInfo = null;
                document.body.style.overflow = "";
            }
        }
        static open(options) {
            new ZenWallet(options).open(options);
        }
    }
    if (typeof window !== "undefined") {
        window.ZenWallet = ZenWallet;
        window.ZenPay = ZenWallet;
        console.log("🚀 ZenWallet Loader SDK Initialized (v1.1.0)");
    }
    return ZenWallet;
})();
