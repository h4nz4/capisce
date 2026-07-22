$ErrorActionPreference = 'Stop'
$d   = 'C:/Users/Ivan/AppData/Local/Temp/claude/E--PROJEKTI-capisce/4462febb-a90c-4522-b1a1-fde157dce7b8/scratchpad/bench'
$out = "$d/api-results2.jsonl"
Remove-Item $out -ErrorAction SilentlyContinue

# Concise arm: a competent, minimal "be brief" instruction — the honest ceiling to beat.
$concise = @'
Be concise. No preamble, no restating the question, no pleasantries, no summary or
recap at the end. Give the answer directly and stop. Keep every technical fact exact.
'@
Set-Content "$d/concise-sys.txt" $concise -Encoding utf8

$tasks = @(
  @{ id='deploy';   q="The deploy failed and DATABASE_URL is empty. What happened and how do I fix it?" }
  @{ id='race';     q="My counter is sometimes off by one under load. Explain why and how to fix it." }
  @{ id='rerender'; q="My React component re-renders on every keystroke. Why, and what do I do about it?" }
  @{ id='cache';    q="Is it worth adding Redis caching to an endpoint that gets 50 requests a minute?" }
  @{ id='review';   q="Review this approach: storing session tokens in localStorage. Good idea or not?" }
  @{ id='green';    q="All 47 tests pass and latency dropped 30% after my change. Anything I should watch out for?" }
)

$arms = @(
  @{ name='baseline'; sys=$null }
  @{ name='concise';  sys="$d/concise-sys.txt" }
  @{ name='capisce';  sys="$d/capisce-sys.txt" }
)

foreach ($t in $tasks) {
  foreach ($run in 1..3) {
    foreach ($a in $arms) {
      # No tools: every arm answers from knowledge in a single turn, so output_tokens
      # is the answer itself and nothing else.
      $prompt = "Answer this engineering question directly from knowledge. Do not use any tools. Question: $($t.q)"
      $flags = @('-p', $prompt, '--output-format', 'json')
      if ($a.sys) { $flags += @('--append-system-prompt-file', $a.sys) }
      try {
        $o = (& claude @flags 2>$null | Out-String) | ConvertFrom-Json
        [pscustomobject]@{
          task=$t.id; arm=$a.name; run=$run
          output_tokens=$o.usage.output_tokens
          is_error=$o.is_error
          answer=$o.result
        } | ConvertTo-Json -Compress -Depth 6 | Add-Content -Path $out -Encoding utf8
        "{0,-9} {1,-9} #{2}  out={3}" -f $t.id, $a.name, $run, $o.usage.output_tokens
      } catch {
        "{0,-9} {1,-9} #{2}  FAIL" -f $t.id, $a.name, $run
      }
    }
  }
}
"DONE -> $out"
