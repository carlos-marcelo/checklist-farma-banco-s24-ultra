# Checklist Farma - Deploy Online com Banco Local

Este projeto esta configurado para publicar o frontend no GitHub Pages.

## Como deixar online usando banco local

1. Mantenha seu PostgREST local ativo em `http://localhost:3000`.
2. Abra um tunel publico para essa porta (exemplo com `cloudflared`):

```bash
cloudflared tunnel --url http://localhost:3000
```

3. Copie a URL HTTPS gerada pelo tunel (exemplo: `https://abc123.trycloudflare.com`).
4. No GitHub do repositorio, configure os Secrets em:
   `Settings > Secrets and variables > Actions`
   - `VITE_SUPABASE_URL` = URL do tunel
   - `VITE_SUPABASE_ANON_KEY` = `local-key-to-bypass-auth`
5. Faça push na branch `main`. O workflow `.github/workflows/deploy.yml` fara o build e deploy automaticamente.

## Observacoes importantes

- O site so acessa o banco enquanto seu computador local, PostgREST e tunel estiverem ligados.
- Se a URL do tunel mudar, atualize o secret `VITE_SUPABASE_URL`.
- Para producao estavel, o ideal e migrar o banco/API para um host publico fixo.
