// PATCH 05: client/src/pages/AppMyClosing.tsx
// Goal: worker side flow = save draft -> review/confirm -> submit.

const [showReview, setShowReview] = useState(false);

// Replace direct submit button with a review step:
<Button disabled={!canEdit || busy} onClick={() => {
  if (receiptRequired && !detail.submission?.receiptUploaded) {
    toast.error("領収書が必要です。提出前にアップロードしてください。");
    return;
  }
  setShowReview(true);
}}>
  提出前確認
</Button>

// Add review dialog near the component return:
<Dialog open={showReview} onOpenChange={setShowReview}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>月締め提出前確認</DialogTitle>
    </DialogHeader>

    <div className="space-y-3 text-sm">
      <div className="rounded-md border p-3">
        <div className="text-muted-foreground text-xs">現場</div>
        <div className="font-medium">{detail?.project?.name || selectedProject?.name}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border p-3">
          <div className="text-muted-foreground text-xs">対象月</div>
          <div className="font-medium">{closingMonth}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-muted-foreground text-xs">領収書</div>
          <div className="font-medium">
            {receiptRequired ? (detail?.submission?.receiptUploaded ? "添付済" : "未添付") : "不要"}
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-muted-foreground text-xs">交通費</div>
          <div className="font-medium">{formatYen(transportAmount)}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-muted-foreground text-xs">経費</div>
          <div className="font-medium">{formatYen(expenseAmount)}</div>
        </div>
      </div>

      {notes && (
        <div className="rounded-md border p-3">
          <div className="text-muted-foreground text-xs">メモ</div>
          <div className="whitespace-pre-wrap">{notes}</div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        内容を確認してから会社へ提出します。修正する場合は戻って保存し直してください。
      </p>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => setShowReview(false)}>戻る</Button>
      <Button
        onClick={() => {
          setShowReview(false);
          handleSubmit();
        }}
        disabled={submitMutation.isPending}
      >
        この内容で提出
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
