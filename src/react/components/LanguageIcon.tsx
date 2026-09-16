import type { IconType } from "react-icons";
import { FiCode, FiGlobe, FiTerminal } from "react-icons/fi";
import { FaJava } from "react-icons/fa";
import {
  SiC, SiClojure, SiDart, SiDotnet, SiGo, SiJavascript, SiKotlin,
  SiNodedotjs, SiOcaml, SiPhp, SiPython, SiR, SiRuby, SiRust,
  SiSwift, SiTypescript,
} from "react-icons/si";

type Language = { label: string; icon: IconType; color: string };
const languages: Record<string, Language> = {
  c: { label: "C", icon: SiC, color: "#659ad2" },
  csharp: { label: "C#", icon: SiDotnet, color: "#9873d4" },
  clojure: { label: "Clojure", icon: SiClojure, color: "#70a756" },
  dart: { label: "Dart", icon: SiDart, color: "#35a8df" },
  fsharp: { label: "F#", icon: SiDotnet, color: "#54a7c7" },
  go: { label: "Go", icon: SiGo, color: "#00a5c9" },
  http: { label: "HTTP", icon: FiGlobe, color: "#729bde" },
  java: { label: "Java", icon: FaJava, color: "#e18a43" },
  javascript: { label: "JavaScript", icon: SiJavascript, color: "#c79e19" },
  typescript: { label: "TypeScript", icon: SiTypescript, color: "#438bd5" },
  kotlin: { label: "Kotlin", icon: SiKotlin, color: "#b77aea" },
  node: { label: "Node.js", icon: SiNodedotjs, color: "#69a65b" },
  objc: { label: "Objective-C", icon: SiC, color: "#5b97cb" },
  ocaml: { label: "OCaml", icon: SiOcaml, color: "#d3944b" },
  php: { label: "PHP", icon: SiPhp, color: "#929bd0" },
  powershell: { label: "PowerShell", icon: FiTerminal, color: "#669bda" },
  python: { label: "Python", icon: SiPython, color: "#e4b344" },
  r: { label: "R", icon: SiR, color: "#6c9fd8" },
  ruby: { label: "Ruby", icon: SiRuby, color: "#db6464" },
  rust: { label: "Rust", icon: SiRust, color: "#ce936e" },
  shell: { label: "Shell", icon: FiTerminal, color: "#74ad80" },
  curl: { label: "cURL", icon: FiTerminal, color: "#74ad80" },
  swift: { label: "Swift", icon: SiSwift, color: "#ec825f" },
};

export function languageLabel(value: string) {
  return languages[value]?.label ?? value;
}

export function LanguageIcon({ language }: { language: string }) {
  const languageInfo = languages[language];
  const Icon = languageInfo?.icon ?? FiCode;
  return <span className="pde-oas-language-icon" style={{ color: languageInfo?.color }} aria-hidden="true"><Icon /></span>;
}

export function clientLabel(value: string) {
  const labels: Record<string, string> = {
    curl: "cURL", fetch: "Fetch", axios: "Axios", jquery: "jQuery",
    xhr: "XMLHttpRequest", aiohttp: "aiohttp", requests: "Requests",
    httpx: "HTTPX", urllib: "urllib", nethttp: "net/http", native: "Native",
    okhttp: "OkHttp", unirest: "Unirest", restsharp: "RestSharp",
    httpclient: "HttpClient", alamofire: "Alamofire", urlsession: "URLSession",
  };
  return labels[value] ?? value;
}
