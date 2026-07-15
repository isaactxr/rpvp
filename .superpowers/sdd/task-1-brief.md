### Task 1: Add `usuarios_faces` Schema

**Files:**
- Modify: `db/init.sql`
- Modify: `backend/server.js`

**Interfaces:**
- Produces table `usuarios_faces(id, usuario_id, face, embedding, content_type, atualizado_em)`.
- Later tasks rely on `usuarios_faces.embedding` as `DOUBLE PRECISION[]`.

- [ ] **Step 1: Add the table to `db/init.sql` after the `usuarios` table definition**

Add:

```sql
CREATE TABLE public.usuarios_faces (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    face bytea NOT NULL,
    embedding double precision[],
    content_type character varying(100) DEFAULT 'image/jpeg'::character varying NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.usuarios_faces OWNER TO vianapeixoto;

CREATE SEQUENCE public.usuarios_faces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.usuarios_faces_id_seq OWNER TO vianapeixoto;
ALTER SEQUENCE public.usuarios_faces_id_seq OWNED BY public.usuarios_faces.id;
ALTER TABLE ONLY public.usuarios_faces ALTER COLUMN id SET DEFAULT nextval('public.usuarios_faces_id_seq'::regclass);

ALTER TABLE ONLY public.usuarios_faces
    ADD CONSTRAINT usuarios_faces_pkey PRIMARY KEY (id);

CREATE INDEX idx_usuarios_faces_usuario_id ON public.usuarios_faces USING btree (usuario_id);
CREATE INDEX idx_usuarios_faces_embedding_not_null ON public.usuarios_faces USING btree (usuario_id) WHERE (embedding IS NOT NULL);

ALTER TABLE ONLY public.usuarios_faces
    ADD CONSTRAINT usuarios_faces_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Add startup migration in `backend/server.js`**

Inside `iniciar()`, after user/table compatibility migrations, add:

```js
    console.log('[server] Garantindo estrutura de faces de usuarios...');
    await db.query(
      `CREATE TABLE IF NOT EXISTS usuarios_faces (
         id SERIAL PRIMARY KEY,
         usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
         face BYTEA NOT NULL,
         embedding DOUBLE PRECISION[],
         content_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
         atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`
    );

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_usuarios_faces_usuario_id
       ON usuarios_faces (usuario_id)`
    );

    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_usuarios_faces_embedding_not_null
       ON usuarios_faces (usuario_id)
       WHERE embedding IS NOT NULL`
    );
```

- [ ] **Step 3: Verify SQL syntax**

Run:

```powershell
rg -n "usuarios_faces" db/init.sql backend/server.js
```

Expected: matches in both files.

- [ ] **Step 4: Commit**

```bash
git add db/init.sql backend/server.js
git commit -m "feat: add user face storage table"
```

---

