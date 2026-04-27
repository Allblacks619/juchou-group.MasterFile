// PATCH 02: server/routers.ts
// Goal: generateForClosing creates invoice draft only.
// Do not generate PDF here.
// Do not replace entire routers.ts file.

// Find the existing closing.generateForClosing endpoint.
// Replace only that endpoint implementation with the following structure.
// Keep local naming/style if needed.

generateForClosing: leaderOrAdminProcedure
  .input(z.object({
    projectId: z.number().optional(),
    projectIds: z.array(z.number()).optional(),
    closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
  }))
  .mutation(async ({ ctx, input }) => {
    const selectedProjectIds = input.projectIds?.length
      ? Array.from(new Set(input.projectIds.map(Number).filter(Boolean)))
      : input.projectId ? [input.projectId] : [];

    if (!selectedProjectIds.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "案件が選択されていません" });
    }

    const { start, end } = getMonthDateRange(input.closingMonth);

    const draft = await buildInvoiceDraftFromProjects({
      projectIds: selectedProjectIds,
      periodStart: start,
      periodEnd: end,
      allowedClosingStatuses: ["ready", "closed", "locked"],
      taxRate: 10,
      includeProjectSectionHeaders: selectedProjectIds.length > 1,
    });

    const billableItems = draft.items.filter((item: any) => item.itemType !== "text");
    if (!billableItems.length || Number(draft.totalAmount || 0) <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "請求対象データがありません。空または0円の請求書ドラフトは作成できません。",
      });
    }

    const invoiceNumber = await db.getNextInvoiceNumber(input.closingMonth);

    const invoice = await db.createInvoice({
      invoiceNumber,
      clientId: draft.clientId,
      projectId: draft.primaryProjectId,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      issueDate: new Date(),
      dueDate: null,
      subtotal: draft.subtotal,
      taxAmount: draft.taxAmount,
      totalAmount: draft.totalAmount,
      taxRate: 10,
      status: "draft",
      notes: null,
      internalMemo: `closing draft / projectIds=${draft.projectIds.join(",")}`,
      pdfUrl: null,
      receivedAmount: 0,
      receivedAt: null,
      receivedBy: null,
      paymentMemo: null,
      createdBy: ctx.user.id,
      honorific: "御中",
      subNumber: null,
      paymentMethod: "口座振込",
      subject: draft.subject,
      showSeal: true,
      showLogo: true,
      withholding: !!draft.withholdingAmount,
      withholdingAmount: draft.withholdingAmount,
    } as any);

    for (const item of draft.items) {
      await db.createInvoiceItem({
        invoiceId: invoice.id,
        employeeId: item.employeeId,
        itemType: item.itemType,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: item.amount,
        itemTaxRate: item.itemTaxRate,
        sortOrder: item.sortOrder,
        notes: item.notes || null,
      } as any);
    }

    await safeAuditLog(ctx.user.id, "invoice_draft_created_from_closing", "invoice", {
      invoiceId: invoice.id,
      projectId: draft.primaryProjectId,
      note: "Created editable invoice draft from monthly closing. PDF not generated yet.",
      payload: {
        closingMonth: input.closingMonth,
        projectIds: draft.projectIds,
        subtotal: draft.subtotal,
        taxAmount: draft.taxAmount,
        totalAmount: draft.totalAmount,
      },
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: draft.totalAmount,
      status: "draft",
      editUrl: `/app/invoices?invoiceId=${invoice.id}`,
      message: "請求書ドラフトを作成しました。PDF出力前に内容を確認・編集してください。",
    };
  })

// Important:
// - Do not call generateInvoicePdf inside closing.generateForClosing.
// - Keep existing invoice.generatePdf endpoint separate, or add it if missing.
// - PDF output must happen only from AppInvoices detail/edit page.
