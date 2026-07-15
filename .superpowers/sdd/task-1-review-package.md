# Review Package: Task 1

## Commits
028cb66 feat: add user face storage table

## Stat
 backend/server.js | 23 ++++++++++++++++++++
 db/init.sql       | 64 ++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 2 files changed, 86 insertions(+), 1 deletion(-)

## Diff
diff --git a/backend/server.js b/backend/server.js
index 8b59673..a8af358 100644
--- a/backend/server.js
+++ b/backend/server.js
@@ -166,20 +166,43 @@ async function iniciar() {
       `ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS reset_senha_primeiro_acesso BOOLEAN NOT NULL DEFAULT false`
     );
 
     await db.query(
       `CREATE UNIQUE INDEX IF NOT EXISTS usuarios_cpf_unique_idx
        ON usuarios (cpf)
        WHERE cpf IS NOT NULL`
     );
 
+    console.log('[server] Garantindo estrutura de faces de usuarios...');
+    await db.query(
+      `CREATE TABLE IF NOT EXISTS usuarios_faces (
+         id SERIAL PRIMARY KEY,
+         usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
+         face BYTEA NOT NULL,
+         embedding DOUBLE PRECISION[],
+         content_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
+         atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
+       )`
+    );
+
+    await db.query(
+      `CREATE INDEX IF NOT EXISTS idx_usuarios_faces_usuario_id
+       ON usuarios_faces (usuario_id)`
+    );
+
+    await db.query(
+      `CREATE INDEX IF NOT EXISTS idx_usuarios_faces_embedding_not_null
+       ON usuarios_faces (usuario_id)
+       WHERE embedding IS NOT NULL`
+    );
+
     await db.query(
       `CREATE TABLE IF NOT EXISTS sessoes_autenticacao (
          id BIGSERIAL PRIMARY KEY,
          token_hash CHAR(64) NOT NULL UNIQUE,
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          expira_em TIMESTAMPTZ NOT NULL,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          revogado_em TIMESTAMPTZ
        )`
     );
diff --git a/db/init.sql b/db/init.sql
index 04088b6..385d560 100644
--- a/db/init.sql
+++ b/db/init.sql
@@ -257,20 +257,46 @@ CREATE TABLE public.usuarios (
     cpf character varying(11),
     reset_senha_primeiro_acesso boolean DEFAULT false NOT NULL,
     setor_id integer,
     CONSTRAINT usuarios_perfil_acesso_chk CHECK (((perfil_acesso)::text = ANY ((ARRAY['admin'::character varying, 'instrutor'::character varying, 'gestor'::character varying, 'colaborador'::character varying])::text[]))),
     CONSTRAINT usuarios_usuario_formato_chk CHECK (((usuario IS NULL) OR ((usuario)::text ~* '^[A-Z0-9._-]{3,60}$'::text) OR ((usuario)::text ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'::text)))
 );
 
 
 ALTER TABLE public.usuarios OWNER TO vianapeixoto;
 
+--
+-- Name: usuarios_faces; Type: TABLE; Schema: public; Owner: vianapeixoto
+--
+
+CREATE TABLE public.usuarios_faces (
+    id integer NOT NULL,
+    usuario_id integer NOT NULL,
+    face bytea NOT NULL,
+    embedding double precision[],
+    content_type character varying(100) DEFAULT 'image/jpeg'::character varying NOT NULL,
+    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
+);
+
+ALTER TABLE public.usuarios_faces OWNER TO vianapeixoto;
+
+CREATE SEQUENCE public.usuarios_faces_id_seq
+    AS integer
+    START WITH 1
+    INCREMENT BY 1
+    NO MINVALUE
+    NO MAXVALUE
+    CACHE 1;
+
+ALTER SEQUENCE public.usuarios_faces_id_seq OWNER TO vianapeixoto;
+ALTER SEQUENCE public.usuarios_faces_id_seq OWNED BY public.usuarios_faces.id;
+
 --
 -- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: vianapeixoto
 --
 
 CREATE SEQUENCE public.usuarios_id_seq
     AS integer
     START WITH 1
     INCREMENT BY 1
     NO MINVALUE
     NO MAXVALUE
@@ -321,20 +347,27 @@ ALTER TABLE ONLY public.setores ALTER COLUMN id SET DEFAULT nextval('public.seto
 ALTER TABLE ONLY public.tipos_sessao ALTER COLUMN id SET DEFAULT nextval('public.tipos_sessao_id_seq'::regclass);
 
 
 --
 -- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: vianapeixoto
 --
 
 ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);
 
 
+--
+-- Name: usuarios_faces id; Type: DEFAULT; Schema: public; Owner: vianapeixoto
+--
+
+ALTER TABLE ONLY public.usuarios_faces ALTER COLUMN id SET DEFAULT nextval('public.usuarios_faces_id_seq'::regclass);
+
+
 --
 -- Data for Name: configuracoes; Type: TABLE DATA; Schema: public; Owner: vianapeixoto
 --
 
 COPY public.configuracoes (chave, valor, tipo, descricao, atualizado_em) FROM stdin;
 cooldown_entre_tentativas_ms	10000	integer	Cooldown em milissegundos entre tentativas de reconhecimento facial	2026-04-22 21:08:01.47216+00
 frames_fechado_min	2	integer	Frames consecutivos com EAR fechado para validar o estado	2026-04-22 21:08:01.47216+00
 frames_aberto_min	2	integer	Frames consecutivos com EAR aberto para validar o estado	2026-04-22 21:08:01.47216+00
 atraso_pos_piscada_ms	700	integer	Atraso em milissegundos entre detectar a piscada e capturar a foto	2026-04-22 21:08:01.47216+00
 checkout_obrigatorio	false	boolean	Exige checkout facial para considerar a presença como concluída	2026-04-22 21:08:01.47216+00
@@ -504,20 +537,28 @@ ALTER TABLE ONLY public.tipos_sessao
 
 
 --
 -- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
 --
 
 ALTER TABLE ONLY public.usuarios
     ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
 
 
+--
+-- Name: usuarios_faces usuarios_faces_pkey; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
+--
+
+ALTER TABLE ONLY public.usuarios_faces
+    ADD CONSTRAINT usuarios_faces_pkey PRIMARY KEY (id);
+
+
 --
 -- Name: usuarios usuarios_subject_compreface_key; Type: CONSTRAINT; Schema: public; Owner: vianapeixoto
 --
 
 ALTER TABLE ONLY public.usuarios
     ADD CONSTRAINT usuarios_subject_compreface_key UNIQUE (subject_compreface);
 
 
 --
 -- Name: usuarios_cpf_unique_idx; Type: INDEX; Schema: public; Owner: vianapeixoto
@@ -652,20 +693,34 @@ CREATE INDEX idx_usuarios_perfil ON public.usuarios USING btree (perfil_acesso);
 CREATE INDEX idx_usuarios_setor_id ON public.usuarios USING btree (setor_id);
 
 
 --
 -- Name: idx_usuarios_usuario_lower; Type: INDEX; Schema: public; Owner: vianapeixoto
 --
 
 CREATE INDEX idx_usuarios_usuario_lower ON public.usuarios USING btree (lower((usuario)::text));
 
 
+--
+-- Name: idx_usuarios_faces_usuario_id; Type: INDEX; Schema: public; Owner: vianapeixoto
+--
+
+CREATE INDEX idx_usuarios_faces_usuario_id ON public.usuarios_faces USING btree (usuario_id);
+
+
+--
+-- Name: idx_usuarios_faces_embedding_not_null; Type: INDEX; Schema: public; Owner: vianapeixoto
+--
+
+CREATE INDEX idx_usuarios_faces_embedding_not_null ON public.usuarios_faces USING btree (usuario_id) WHERE (embedding IS NOT NULL);
+
+
 --
 -- Name: presencas_imagens presencas_imagens_presenca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
 --
 
 ALTER TABLE ONLY public.presencas_imagens
     ADD CONSTRAINT presencas_imagens_presenca_id_fkey FOREIGN KEY (presenca_id) REFERENCES public.presencas(id) ON DELETE CASCADE;
 
 
 --
 -- Name: presencas presencas_sessao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
@@ -700,23 +755,30 @@ ALTER TABLE ONLY public.usuarios
 
 
 --
 -- Name: usuarios usuarios_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
 --
 
 ALTER TABLE ONLY public.usuarios
     ADD CONSTRAINT usuarios_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES public.setores(id) ON DELETE SET NULL;
 
 
+--
+-- Name: usuarios_faces usuarios_faces_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: vianapeixoto
+--
+
+ALTER TABLE ONLY public.usuarios_faces
+    ADD CONSTRAINT usuarios_faces_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;
+
+
 
 --
 -- Name: SCHEMA public; Type: ACL; Schema: -; Owner: vianapeixoto
 --
 
 REVOKE USAGE ON SCHEMA public FROM PUBLIC;
 GRANT ALL ON SCHEMA public TO PUBLIC;
 
 
 --
 -- PostgreSQL database dump complete
 --
-
