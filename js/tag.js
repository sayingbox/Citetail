
/* ==========================================
   CITETAIL - COMMON TRACKING
   Google Analytics 4 + Microsoft Clarity
========================================== */

// Google Analytics 4
(function () {
    const GA_ID = "G-59XC6Q1PE5";

    window.dataLayer = window.dataLayer || [];

    window.gtag = function () {
        window.dataLayer.push(arguments);
    };

    gtag("js", new Date());
    gtag("config", GA_ID);

    const gaScript = document.createElement("script");
    gaScript.async = true;
    gaScript.src =
        "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;

    document.head.appendChild(gaScript);
})();

// Microsoft Clarity
(function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () {
        (c[a].q = c[a].q || []).push(arguments);
    };

    t = l.createElement(r);
    t.async = 1;
    t.src = "https://www.clarity.ms/tag/" + i;

    y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);

})(
    window,
    document,
    "clarity",
    "script",
    "y18f6ftmg6"
);
