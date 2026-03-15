# Checklist Farma - Deploy Online com Banco Local

Este projeto esta configurado para publicar o frontend no GitHub Pages.

## Como deixar online usando banco local

1. Mantenha seu PostgREST local ativo em `http://localhost:3000`.
2. Abra um tunel publico para essa porta (exemplo com `cloudflared`):

```bash
cloudflared tunnel --url http://localhost:3000
```

3. Preferencialmente use um host fixo do tunel (exemplo: `https://checklist-api.marcelo.far.br`) em vez de `trycloudflare` temporario.
4. No GitHub do repositorio, configure os Secrets em:
   `Settings > Secrets and variables > Actions`
   - `VITE_SUPABASE_URL` = URL fixa do tunel (`https://checklist-api.marcelo.far.br`)
   - `VITE_SUPABASE_ANON_KEY` = `local-key-to-bypass-auth`
5. Faça push na branch `main`. O workflow `.github/workflows/deploy.yml` fara o build e deploy automaticamente.

## Observacoes importantes

- O site so acessa o banco enquanto seu computador local, PostgREST e tunel estiverem ligados.
- Se usar `trycloudflare`, a URL expira e voce precisara atualizar o secret `VITE_SUPABASE_URL` a cada troca.
- Para producao estavel, o ideal e migrar o banco/API para um host publico fixo.
