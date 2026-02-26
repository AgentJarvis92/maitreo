import { jsx as _jsx } from "react/jsx-runtime";
import './globals.css';
export const metadata = {
    title: 'Maitreo | Intelligent Reputation',
    description: 'Monitor every review. Get alerted and respond by text, only when it matters.',
};
export default function RootLayout({ children }) {
    return (_jsx("html", { lang: "en", children: _jsx("body", { className: "antialiased selection:bg-white selection:text-black", children: children }) }));
}
//# sourceMappingURL=layout.js.map