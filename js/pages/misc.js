/* Telas: Relatórios, Planos, Segurança, Dados da Clínica e Veterinários. */
(function (I) {
  const { esc } = I.ui;
  const P = I.P;
  const R = I.rules;
  const db = I.db;

  /* ---------------- Relatórios ---------------- */
  function loadJsPdf() {
    return new Promise((resolve, reject) => {
      if (window.jspdf) return resolve(window.jspdf.jsPDF);
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
      s.onload = () => resolve(window.jspdf.jsPDF);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  I.pages["/relatorios"] = {
    render(el) {
      const S = I.state;
      const pet = I.activePet();
      if (!pet) { el.innerHTML = P.view(P.emptyPets()); P.bind(el); return; }

      const weights = S.data.weights.filter((w) => w.pet_cod === pet.cod);
      const records = S.data.history.filter((h) => h.cod_pet === pet.cod);
      const consultations = records.filter((h) => h.tipo === "consulta");
      const counts = {};
      consultations.forEach((h) => {
        const year = String(h.data || "").slice(0, 4);
        if (year) counts[year] = (counts[year] || 0) + 1;
      });
      const years = Object.keys(counts).sort().reverse().slice(0, 3);
      const maxCount = Math.max(1, ...years.map((y) => counts[y] || 0));
      const chart = weights.slice(-12);
      const maxWeight = Math.max(1, ...chart.map((w) => Number(w.peso)));
      const last = weights[weights.length - 1];
      const lastWeight = last ? last.peso + " kg (" + R.formatDate(last.data) + ")" : "Sem registros";

      const bars = chart.length
        ? chart.map((w) => {
            const v = Number(w.peso);
            return '<div class="bar-group"><div class="bar-value">' + v + ' kg</div><div class="bar" style="height:' +
              Math.max(4, Math.round((v / maxWeight) * 100)) + '%;background:linear-gradient(to top,var(--green-dark),var(--green-light))"></div>' +
              '<div class="bar-label">' + esc(R.formatDate(w.data).slice(0, 5)) + "</div></div>";
          }).join("")
        : '<p class="text-sm text-mid">Sem registros de peso.</p>';

      const freq = years.length
        ? years.map((y, i) =>
            '<div style="display:flex;align-items:center;gap:12px"><span style="font-size:13px;min-width:70px;color:var(--text-mid)">' + y + "</span>" +
            '<div style="flex:1;height:20px;background:var(--border);border-radius:10px;overflow:hidden"><div style="height:100%;width:' +
            Math.round(((counts[y] || 0) / maxCount) * 100) + "%;background:" + (i === 0 ? "var(--green-mid)" : "var(--sky)") + ';border-radius:10px"></div></div>' +
            '<span style="font-size:12px;font-weight:600">' + counts[y] + "</span></div>").join("")
        : '<p class="text-sm text-mid">Sem consultas registradas.</p>';

      const insights = [
        ["📋", "Consultas", String(consultations.length)],
        ["💉", "Vacinas", String(records.filter((h) => h.tipo === "vacina").length)],
        ["⚖️", "Último peso", lastWeight],
      ].map(([icon, label, value]) =>
        '<div style="background:var(--surface);border-radius:var(--radius-sm);padding:16px;border:1px solid var(--border);text-align:center">' +
        '<div style="font-size:28px;margin-bottom:6px">' + icon + '</div><div style="font-size:13px;font-weight:500;color:var(--green-dark)">' + esc(label) +
        '</div><div style="font-size:16px;margin-top:4px">' + esc(value) + "</div></div>").join("");

      el.innerHTML = P.view(
        '<div class="report-actions"><div><strong>Relatório de saúde</strong><span>Resumo clínico de ' + esc(pet.nome) + "</span></div>" +
        '<button class="btn-sm btn-green" data-act="pdf">⬇ Baixar PDF</button></div>' +
        '<div class="grid-2" style="margin-bottom:20px"><div class="card"><div class="card-header"><div class="card-title-icon">' +
        '<div class="title-icon" style="background:var(--amber-light)">⚖️</div><span class="card-title">Evolução de Peso — ' + esc(pet.nome) + "</span></div>" +
        P.petSelect(pet.cod) + '</div><div class="weight-chart">' + bars + "</div></div>" +
        '<div class="card"><div class="card-header"><div class="card-title-icon"><div class="title-icon" style="background:var(--sky-light)">📊</div>' +
        '<span class="card-title">Frequência de Consultas</span></div></div><div style="display:grid;gap:10px;margin-top:4px">' + freq + "</div></div></div>" +
        '<div class="card"><div class="card-header"><div class="card-title-icon"><div class="title-icon" style="background:var(--purple-light)">🔍</div>' +
        '<span class="card-title">Insights de Saúde</span></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px">' +
        insights + "</div></div>",
      );

      P.bind(el, {
        pdf: async () => {
          try {
            const JsPDF = await loadJsPdf();
            const doc = new JsPDF();
            doc.setProperties({ title: "Relatório de saúde — " + pet.nome, subject: "Resumo clínico Itapet", author: "Itapet" });
            doc.setTextColor(27, 67, 50);
            doc.setFontSize(22);
            doc.text("Itapet", 20, 24);
            doc.setFontSize(16);
            doc.text("Relatório de saúde — " + pet.nome, 20, 36);
            doc.setDrawColor(64, 145, 108);
            doc.line(20, 42, 190, 42);
            doc.setTextColor(26, 46, 34);
            doc.setFontSize(12);
            const rows = [
              ["Pet", [pet.especie, pet.raca].filter(Boolean).join(" — ")],
              ["Responsável", S.profile.nome || S.email],
              ["Peso atual", last ? last.peso + " kg" : "Sem registros"],
              ["Registros clínicos", String(records.length)],
            ];
            let y = 56;
            rows.forEach(([label, value]) => {
              doc.setFont("helvetica", "bold");
              doc.text(label, 20, y);
              doc.setFont("helvetica", "normal");
              doc.text(String(value || "—").slice(0, 60), 62, y);
              y += 12;
            });
            records.slice(0, 10).forEach((item) => {
              doc.text(R.formatDate(item.data) + " · " + item.tipo + ": " + (item.diagnostico_motivo || "").slice(0, 65), 20, y);
              y += 9;
            });
            doc.setFontSize(9);
            doc.setTextColor(100, 110, 105);
            doc.text("Emitido em " + new Date().toLocaleDateString("pt-BR") + " pelo Itapet", 20, 280);
            doc.save("relatorio-saude-" + pet.nome.replace(/[^\w-]/g, "-") + ".pdf");
          } catch (e) {
            console.error(e);
            I.ui.toast("Não foi possível gerar o PDF.");
          }
        },
      });
    },
  };

  /* ---------------- Planos ---------------- */
  I.pages["/planos"] = {
    render(el) {
      const plan = (cls, badge, name, price, desc, features, button) =>
        '<div class="plan-card' + cls + '">' + (badge ? '<div class="plan-badge">' + badge + "</div>" : "") +
        '<div class="plan-name">' + name + '</div><div class="plan-price">R$' + price + "<span>/mês</span></div>" +
        '<div class="plan-desc">' + desc + '</div><ul class="plan-features">' + features.map((f) => "<li>" + f + "</li>").join("") + "</ul>" + button + "</div>";
      el.innerHTML = P.view(
        '<div class="card" style="margin-bottom:24px;background:linear-gradient(135deg,var(--green-dark),var(--green-light));color:var(--white);border:none">' +
        '<div style="display:flex;justify-content:space-between;align-items:center"><div>' +
        "<div style=\"font-family:'Playfair Display',serif;font-size:22px;margin-bottom:6px\">Plano atual: <strong>Free</strong></div>" +
        '<div style="opacity:.7;font-size:14px">' + I.state.data.pets.length + "/3 pets · 500MB armazenamento</div></div>" +
        '<div style="font-size:48px;opacity:.3">🐾</div></div></div>' +
        '<div class="plans-grid">' +
        plan("", "", "Free", "0", "Para tutores iniciantes", ["Até 3 pets", "500MB de armazenamento", "Histórico básico", "Carteira de vacinação"],
          '<button class="btn-sm btn-outline w-full" style="margin-top:20px;padding:12px">Plano atual</button>') +
        plan(" featured", "Mais popular", "Premium", "19", "Para tutores dedicados",
          ["Pets ilimitados", "5GB de armazenamento", "Prontuário completo", "Relatórios avançados", "Chat com veterinário", "Alertas inteligentes"],
          '<button class="btn-amber w-full" data-act="subscribe">Assinar Premium</button>') +
        plan("", "", "Clínica", "89", "Para clínicas e hospitais",
          ["Até 10 veterinários", "50GB armazenamento", "Agenda coletiva", "Gestão completa", "API de integração", "Suporte prioritário"],
          '<button class="btn-sm btn-outline w-full" style="margin-top:20px;padding:12px" data-act="sales">Falar com vendas</button>') +
        "</div>",
      );
      P.bind(el, {
        subscribe: () => I.ui.toast("Pagamento ainda não está integrado."),
        sales: () => I.ui.toast("Entre em contato com nossa equipe comercial! 🏥"),
      });
    },
  };

  /* ---------------- Segurança ---------------- */
  const SETTINGS = [
    ["🔑", "var(--green-pale)", "Autenticação em 2 fatores", "SMS ou aplicativo autenticador"],
    ["📱", "var(--sky-light)", "Login biométrico", "Face ID / Impressão digital"],
    ["🔔", "var(--amber-light)", "Alertas de acesso", "Notificação ao compartilhar dados"],
    ["📦", "var(--purple-light)", "Backup automático", "Dados salvos diariamente"],
  ];
  const secOff = {};

  I.pages["/seguranca"] = {
    render(el) {
      const items = SETTINGS.map(([icon, bg, title, desc]) =>
        '<div class="security-item"><div class="sec-icon" style="background:' + bg + '">' + icon + '</div><div class="sec-info"><div class="sec-title">' +
        esc(title) + '</div><div class="sec-desc">' + esc(desc) + "</div></div>" +
        '<div class="toggle' + (secOff[title] ? " off" : "") + '" role="switch" aria-checked="' + !secOff[title] + '" data-act="toggle" data-key="' + esc(title) + '"></div></div>').join("");
      el.innerHTML = P.view(
        '<div class="grid-2"><div class="card" style="margin-bottom:20px"><div class="card-header"><span class="card-title">🔐 Configurações de Acesso</span></div>' + items + "</div>" +
        '<div class="card"><div class="card-header"><span class="card-title">🇧🇷 LGPD — Seus Dados</span></div>' +
        '<div style="background:var(--green-pale);border-radius:var(--radius-sm);padding:16px;margin-bottom:16px">' +
        '<div style="font-size:13px;font-weight:500;color:var(--green-dark);margin-bottom:6px">✅ Em conformidade com a LGPD</div>' +
        '<div style="font-size:12px;color:var(--green-mid)">Seus dados médicos são criptografados em trânsito (TLS 1.3) e em repouso (AES-256).</div></div>' +
        '<div class="security-item"><div class="sec-icon" style="background:var(--coral-light)">📋</div><div class="sec-info"><div class="sec-title">Exportar meus dados</div>' +
        '<div class="sec-desc">Baixar todo o histórico em JSON</div></div><button class="btn-sm btn-outline" data-act="export">Exportar</button></div>' +
        '<div class="security-item"><div class="sec-icon" style="background:var(--coral-light)">🗑️</div><div class="sec-info"><div class="sec-title">Excluir conta</div>' +
        '<div class="sec-desc">Remove permanentemente todos os dados</div></div><button class="btn-danger" data-act="delete-account">Solicitar</button></div></div></div>',
      );
      P.bind(el, {
        toggle: (t) => {
          const key = t.dataset.key;
          secOff[key] = !secOff[key];
          t.classList.toggle("off", !!secOff[key]);
          t.setAttribute("aria-checked", String(!secOff[key]));
        },
        export: () => {
          const S = I.state;
          const contents = {
            profile: S.profile,
            pets: S.data.pets.map((p) => { const c = Object.assign({}, p); delete c.photoUrl; return c; }),
            history: S.data.history,
            appointments: S.data.reminders,
            weights: S.data.weights,
            exportedAt: new Date().toISOString(),
          };
          const url = URL.createObjectURL(new Blob([JSON.stringify(contents, null, 2)], { type: "application/json" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = "itapet-meus-dados.json";
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        "delete-account": () => I.ui.toast("A solicitação LGPD deve ser feita pelo canal de suporte da clínica."),
      });
    },
  };

  /* ---------------- Dados da Clínica ---------------- */
  I.pages["/clinica/perfil"] = {
    render(el) {
      const c = I.state.profile;
      if (c.role !== "clinica") { el.innerHTML = P.onlyClinic(); return; }
      const input = (label, name, value, extra) =>
        '<div class="form-group"><label>' + label + '</label><input class="form-input" name="' + name + '" value="' + esc(value || "") + '"' + (extra || "") + "></div>";
      el.innerHTML = P.view(
        '<div class="card" style="margin-bottom:20px" id="clinic-form"><div class="card-header"><span class="card-title">Dados da Clínica</span></div>' +
        '<div class="form-row">' + input("Razão Social", "nome", c.nome) + input("CNPJ", "cnpj", c.cnpj) + "</div>" +
        '<div class="form-row">' + input("Telefone", "telefone", c.telefone) +
        '<div class="form-group"><label>E-mail</label><input class="form-input" value="' + esc(c.email || "") + '" readonly></div></div>' +
        '<div class="form-row">' + input("Endereço", "endereco", c.endereco) + input("CEP", "cep", c.cep) + "</div>" +
        '<button class="btn-primary" data-act="save-clinic">Salvar alterações</button></div>',
      );
      P.bind(el, {
        "save-clinic": async (btn) => {
          const f = P.values(el.querySelector("#clinic-form"));
          btn.disabled = true;
          btn.textContent = "Salvando...";
          try {
            await db.updateClinic(c.cod, {
              nome: f.nome.trim(), cnpj: f.cnpj.trim() || null, telefone: f.telefone.trim() || null,
              endereco: f.endereco.trim() || null, cep: f.cep.trim() || null,
            });
            await I.refreshProfile();
            I.ui.toast("Dados da clínica atualizados.");
          } catch (error) {
            I.ui.toast(db.errorMessage(error));
            btn.disabled = false;
            btn.textContent = "Salvar alterações";
          }
        },
      });
    },
  };

  /* ---------------- Veterinários ---------------- */
  I.pages["/clinica/veterinarios"] = {
    render(el) {
      const S = I.state;
      if (S.role !== "clinica") { el.innerHTML = P.onlyClinic(); return; }
      const upcoming = P.upcoming();
      const vets = S.data.vets.length
        ? S.data.vets.map((v) =>
            '<div class="file-item"><div class="file-icon" style="background:var(--sky-light);color:var(--sky)">🩺</div><div class="file-info"><div class="file-name">' +
            esc(v.nome) + '</div><div class="file-meta">' + esc([v.crmv, v.especialidade, v.email].filter(Boolean).join(" · ")) + "</div></div></div>").join("")
        : '<p class="text-sm text-mid">Nenhum veterinário cadastrado.</p>';
      el.innerHTML = P.view(
        '<div class="card" style="margin-bottom:20px"><div class="card-header"><span class="card-title">Veterinários cadastrados</span>' +
        '<button class="btn-sm btn-green" data-act="open-modal" data-modal="vet">+ Cadastrar Veterinário</button></div><div class="file-list">' + vets + "</div></div>" +
        '<div class="card"><div class="card-header"><span class="card-title">Consultas agendadas</span></div>' +
        (upcoming.length ? upcoming.map(P.appointmentItem).join("") : '<p class="text-sm text-mid">Nenhuma consulta agendada.</p>') + "</div>",
      );
      P.bind(el);
    },
  };
})(window.Itapet);
