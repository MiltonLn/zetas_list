import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function RulesPage() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/reglas.md')
      .then((res) => res.text())
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        setContent('Error cargando las reglas.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1020] flex items-center justify-center">
        <div className="text-[#a0a4c8] text-lg">Cargando reglas...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1020] text-[#e8eaf6] px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 flex flex-col items-center gap-3">
          <img src="/logo.png" alt="Zetas" className="w-24 h-24 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Reglas del Grupo 2026</h1>
          <p className="text-lg text-[#a0a4c8]">Reglamento Zetas Club 🏐</p>
        </div>

        <article className="rules-content">
          <ReactMarkdown>{content}</ReactMarkdown>
        </article>

        <footer className="mt-12 pt-6 border-t border-[#2a2d50] text-center text-sm text-[#6b70a0]">
          Zetas Ingenio 2026
        </footer>
      </div>
    </div>
  );
}
