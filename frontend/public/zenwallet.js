
(function () {
    "use strict";

    var CHECKOUT_URL =
        typeof window !== "undefined" && window.__ZENWALLET_CHECKOUT_URL__
            ? window.__ZENWALLET_CHECKOUT_URL__
            : "http://localhost:5174/";

    function ZenWallet(options) {
        this.options = Object.assign({}, options);
        this.iframeEl = null;
        this._setupMessageListener();
    }

    ZenWallet.prototype._setupMessageListener = function () {
        var self = this;
        window.addEventListener("message", function (event) {
            if (!event.data || event.data.source !== "zenwallet-checkout") return;
            var type = event.data.type;
            var payload = event.data.payload;
            if (type === "PAYMENT_SUCCESS") {
                if (self.options.onSuccess) self.options.onSuccess(payload);
                else if (self.options.handler) self.options.handler(payload);
                self.close();
            } else if (type === "PAYMENT_FAILED") {
                if (self.options.onFailure) self.options.onFailure(payload);
            } else if (type === "MODAL_CLOSE") {
                if (self.options.onFailure) self.options.onFailure({ message: 'cancelled', error: 'user_cancelled' });
                self.close();
            }
        });
    };

    ZenWallet.prototype.open = function (checkoutOptions) {
        var opts = Object.assign({}, this.options, checkoutOptions || {});
        var orderId = opts.order_id;
        if (!orderId) throw new Error("ZenWallet: order_id is required");

        var iframe = document.createElement("iframe");
        var params = new URLSearchParams({
            key: opts.key || "",
            order_id: orderId,
            name: opts.name || "",
        });
        var base = opts.checkoutUrl || CHECKOUT_URL;
        iframe.src = base + "?" + params.toString();
        iframe.style.cssText =
            "position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:999999;background:transparent;";
        iframe.allow = "payment";
        document.body.appendChild(iframe);
        document.body.style.overflow = "hidden";
        this.iframeEl = iframe;
    };

    ZenWallet.prototype.close = function () {
        if (this.iframeEl) {
            this.iframeEl.remove();
            this.iframeEl = null;
            document.body.style.overflow = "";
        }
    };

    ZenWallet.open = function (options) {
        var inst = new ZenWallet(options);
        inst.open(options);
    };

    if (typeof window !== "undefined") {
        window.ZenWallet = ZenWallet;
        window.ZenPay = ZenWallet;
        console.log("🚀 ZenWallet SDK Initialized (v2.0)");
    }
})();
