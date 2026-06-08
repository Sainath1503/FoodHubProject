param(
  [string]$WorkbookPath = (Join-Path (Join-Path $PSScriptRoot "..") "qa-artifacts\FoodHub-Observability-Dashboard.xlsx")
)

$ErrorActionPreference = "Stop"

$resolvedWorkbook = [System.IO.Path]::GetFullPath($WorkbookPath)
if (!(Test-Path -LiteralPath $resolvedWorkbook)) {
  throw "Workbook not found: $resolvedWorkbook"
}

function Release-ComObject($object) {
  if ($null -ne $object) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($object)
  }
}

function Sheet($workbook, [string]$name) {
  foreach ($sheet in $workbook.Worksheets) {
    if ($sheet.Name -eq $name) {
      return $sheet
    }
  }
  return $null
}

function LastRow($sheet, [int]$column = 1) {
  $xlUp = -4162
  return $sheet.Cells($sheet.Rows.Count, $column).End($xlUp).Row
}

function Add-Card($sheet, [double]$left, [double]$top, [double]$width, [double]$height, [string]$title, [string]$value, [string]$accentColor) {
  $shape = $sheet.Shapes.AddShape(1, $left, $top, $width, $height)
  $shape.Fill.ForeColor.RGB = 16777215
  $shape.Line.ForeColor.RGB = 15132390
  $null = ($shape.Shadow.Visible = $true)
  $shape.Shadow.ForeColor.RGB = 13092807
  $shape.TextFrame2.TextRange.Text = "$title`n$value"
  $shape.TextFrame2.MarginLeft = 12
  $shape.TextFrame2.MarginRight = 12
  $shape.TextFrame2.MarginTop = 10
  $shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = 1315860
  $shape.TextFrame2.TextRange.ParagraphFormat.Alignment = 2
  $shape.TextFrame2.TextRange.Characters(1, $title.Length).Font.Size = 10
  $null = ($shape.TextFrame2.TextRange.Characters(1, $title.Length).Font.Bold = $true)
  $shape.TextFrame2.TextRange.Characters($title.Length + 2, $value.Length).Font.Size = 22
  $null = ($shape.TextFrame2.TextRange.Characters($title.Length + 2, $value.Length).Font.Bold = $true)

  $bar = $sheet.Shapes.AddShape(1, $left, $top, 6, $height)
  $bar.Fill.ForeColor.RGB = [Convert]::ToInt32($accentColor, 16)
  $null = ($bar.Line.Visible = $false)
}

function Add-Chart($sheet, [string]$title, [int]$chartType, $sourceRange, [double]$left, [double]$top, [double]$width, [double]$height) {
  $chartObject = $sheet.ChartObjects().Add($left, $top, $width, $height)
  $chart = $chartObject.Chart
  $chart.ChartType = $chartType
  $chart.SetSourceData($sourceRange)
  $null = ($chart.HasTitle = $true)
  $chart.ChartTitle.Text = $title
  $chart.ChartTitle.Font.Size = 12
  $null = ($chart.ChartTitle.Font.Bold = $true)
  $chart.ChartArea.Format.Fill.ForeColor.RGB = 16777215
  $chart.ChartArea.Format.Line.ForeColor.RGB = 15132390
  $chart.PlotArea.Format.Fill.ForeColor.RGB = 16777215
  return $chart
}

function NumberOrZero($value) {
  if ($null -eq $value -or $value -eq "") {
    return 0
  }
  return [double]$value
}

$excel = $null
$workbook = $null

try {
  $excel = New-Object -ComObject Excel.Application
  $null = ($excel.Visible = $false)
  $null = ($excel.DisplayAlerts = $false)

  $workbook = $excel.Workbooks.Open($resolvedWorkbook)
  $dashboard = Sheet $workbook "Dashboard"
  if ($null -eq $dashboard) {
    $dashboard = $workbook.Worksheets.Add()
    $dashboard.Name = "Dashboard"
  }

  $dashboard.Activate() | Out-Null
  $dashboard.Cells.Clear()
  foreach ($shape in @($dashboard.Shapes)) {
    $shape.Delete()
  }
  foreach ($chartObject in @($dashboard.ChartObjects())) {
    $chartObject.Delete()
  }

  $runHistory = Sheet $workbook "Run History"
  $executionSummary = Sheet $workbook "Execution Summary"
  $routeMetrics = Sheet $workbook "Route Metrics"
  $statusMetrics = Sheet $workbook "Status Metrics"
  $testMetrics = Sheet $workbook "Test Metrics"
  $testTypeRollup = Sheet $workbook "Test Type Rollup"
  $prCheckFailures = Sheet $workbook "PR Check Failures"
  $loadMetrics = Sheet $workbook "Load Metrics"
  $loadRollup = Sheet $workbook "Load Rollup"
  $serviceHealth = Sheet $workbook "Service Health"
  $requestLogs = Sheet $workbook "Request Logs"

  $dashboard.Cells.Font.Name = "Segoe UI"
  $dashboard.Cells.Font.Size = 10
  $dashboard.Range("A1:Z80").Interior.Color = 16448250
  $dashboard.Columns("A:Z").ColumnWidth = 12
  $dashboard.Rows("1:80").RowHeight = 22
  $null = ($excel.ActiveWindow.DisplayGridlines = $false)

  $header = $dashboard.Range("A1:Z4")
  $header.Merge()
  $header.Interior.Color = 1777430
  $header.Font.Color = 16777215
  $header.Font.Size = 26
  $null = ($header.Font.Bold = $true)
  $header.Value2 = "FoodHub Observability Dashboard"
  $header.HorizontalAlignment = -4131
  $header.VerticalAlignment = -4108

  $subtitle = $dashboard.Range("A5:Z5")
  $subtitle.Merge()
  $subtitle.Interior.Color = 1777430
  $subtitle.Font.Color = 13421772
  $subtitle.Value2 = "Firebase-backed QA observability: execution-so-far metrics, request logs, CI failures, load trends, and service health"

  $scope = "No runs"
  $runCount = 0
  $firstExecution = ""
  $lastExecution = ""
  $totalChecks = 0
  $passedChecks = 0
  $failedChecks = 0
  $skippedChecks = 0
  $requestCount = 0
  $errorCount = 0
  $avgDuration = 0
  $p95Duration = 0
  $paymentSuccess = 0
  $paymentFailure = 0
  $serviceUptime = 0
  $crashIndicators = 0
  $latestHealthAt = ""
  $latestHealthStatus = ""
  [double]$healthyChecks = 0
  [double]$failedHealthChecks = 0

  if ($null -ne $executionSummary -and (LastRow $executionSummary) -ge 2) {
    $scope = [string]$executionSummary.Cells(2, 1).Value2
    $runCount = [int](NumberOrZero ($executionSummary.Cells(2, 2).Value2))
    $firstExecution = [string]$executionSummary.Cells(2, 3).Value2
    $lastExecution = [string]$executionSummary.Cells(2, 4).Value2
    $totalChecks = [int](NumberOrZero ($executionSummary.Cells(2, 5).Value2))
    $passedChecks = [int](NumberOrZero ($executionSummary.Cells(2, 6).Value2))
    $failedChecks = [int](NumberOrZero ($executionSummary.Cells(2, 7).Value2))
    $skippedChecks = [int](NumberOrZero ($executionSummary.Cells(2, 8).Value2))
    $requestCount = [int](NumberOrZero ($executionSummary.Cells(2, 9).Value2))
    $errorCount = [int](NumberOrZero ($executionSummary.Cells(2, 10).Value2))
    $avgDuration = [double](NumberOrZero ($executionSummary.Cells(2, 11).Value2))
    $p95Duration = [double](NumberOrZero ($executionSummary.Cells(2, 12).Value2))
    $paymentSuccess = [int](NumberOrZero ($executionSummary.Cells(2, 13).Value2))
    $paymentFailure = [int](NumberOrZero ($executionSummary.Cells(2, 14).Value2))
  }

  if ($null -ne $serviceHealth -and (LastRow $serviceHealth) -ge 2) {
    $serviceUptime = [double](NumberOrZero ($serviceHealth.Cells(2, 5).Value2))
    $crashIndicators = [int](NumberOrZero ($serviceHealth.Cells(2, 6).Value2))
    $latestHealthAt = [string]$serviceHealth.Cells(2, 8).Value2
    $latestHealthStatus = [string]$serviceHealth.Cells(2, 9).Value2
    $healthyChecks = [double](NumberOrZero ($serviceHealth.Cells(2, 3).Value2))
    $failedHealthChecks = [double](NumberOrZero ($serviceHealth.Cells(2, 4).Value2))
  }

  $passRate = if ($totalChecks -gt 0) { "{0:P1}" -f ($passedChecks / $totalChecks) } else { "0.0%" }
  $failRate = if ($totalChecks -gt 0) { "{0:P1}" -f ($failedChecks / $totalChecks) } else { "0.0%" }
  $errorRate = if ($requestCount -gt 0) { "{0:P1}" -f ($errorCount / $requestCount) } else { "0.0%" }
  $uptimeRate = "{0:N1}%" -f $serviceUptime
  $prFailureCount = if ($null -ne $prCheckFailures -and (LastRow $prCheckFailures) -ge 2) { (LastRow $prCheckFailures) - 1 } else { 0 }

  Add-Card $dashboard 18 118 128 88 "Runs So Far" "$runCount" "1F6F50"
  Add-Card $dashboard 158 118 128 88 "Total Tests" "$totalChecks" "2B6CB0"
  Add-Card $dashboard 298 118 128 88 "Pass %" $passRate "43A047"
  Add-Card $dashboard 438 118 128 88 "Fail %" $failRate "E53935"
  Add-Card $dashboard 578 118 128 88 "PR Failures" "$prFailureCount" "C2185B"
  Add-Card $dashboard 718 118 128 88 "Requests" "$requestCount" "FB8C00"
  Add-Card $dashboard 858 118 128 88 "P95 ms" "$p95Duration" "00ACC1"
  Add-Card $dashboard 998 118 128 88 "Uptime" $uptimeRate "00897B"
  Add-Card $dashboard 1138 118 128 88 "Crashes" "$crashIndicators" "6D4C41"

  $row = 70
  $dashboard.Cells($row, 1).Value2 = "Status"
  $dashboard.Cells($row, 2).Value2 = "Count"
  $dashboard.Cells($row + 1, 1).Value2 = "Passed"
  $dashboard.Cells($row + 1, 2).Value2 = $passedChecks
  $dashboard.Cells($row + 2, 1).Value2 = "Failed"
  $dashboard.Cells($row + 2, 2).Value2 = $failedChecks
  $dashboard.Cells($row + 3, 1).Value2 = "Skipped/Other"
  $dashboard.Cells($row + 3, 2).Value2 = $skippedChecks

  $dashboard.Cells($row, 4).Value2 = "Metric"
  $dashboard.Cells($row, 5).Value2 = "Value"
  $dashboard.Cells($row + 1, 4).Value2 = "Average Duration ms"
  $dashboard.Cells($row + 1, 5).Value2 = ("{0:N2}" -f $avgDuration)
  $dashboard.Cells($row + 2, 4).Value2 = "P95 Duration ms"
  $dashboard.Cells($row + 2, 5).Value2 = ("{0:N2}" -f $p95Duration)
  $dashboard.Cells($row + 3, 4).Value2 = "Error Rate"
  $dashboard.Cells($row + 3, 5).Value2 = [string]$errorRate
  $dashboard.Cells($row + 4, 4).Value2 = "Service Uptime %"
  $dashboard.Cells($row + 4, 5).Value2 = ("{0:N2}" -f $serviceUptime)

  $dashboard.Cells($row, 7).Value2 = "Payment"
  $dashboard.Cells($row, 8).Value2 = "Count"
  $dashboard.Cells($row + 1, 7).Value2 = "Successful"
  $dashboard.Cells($row + 1, 8).Value2 = [string]$paymentSuccess
  $dashboard.Cells($row + 2, 7).Value2 = "Failed"
  $dashboard.Cells($row + 2, 8).Value2 = [string]$paymentFailure

  $dashboard.Cells($row, 19).Value2 = "Service"
  $dashboard.Cells($row, 20).Value2 = "Count"
  $dashboard.Cells($row + 1, 19).Value2 = "Healthy Checks"
  $dashboard.Cells($row + 1, 20).Value2 = $healthyChecks
  $dashboard.Cells($row + 2, 19).Value2 = "Failed Health Checks"
  $dashboard.Cells($row + 2, 20).Value2 = $failedHealthChecks
  $dashboard.Cells($row + 3, 19).Value2 = "Crash Indicators"
  $dashboard.Cells($row + 3, 20).Value2 = $crashIndicators

  $xlDoughnut = -4120
  $xlColumnClustered = 51
  $xlBarClustered = 57
  $xlLineMarkers = 65

  $statusChart = Add-Chart $dashboard "Pass / Fail Distribution" $xlDoughnut $dashboard.Range("A70:B73") 18 226 320 250
  $statusChart.SeriesCollection(1).Points(1).Format.Fill.ForeColor.RGB = 4497479
  $statusChart.SeriesCollection(1).Points(2).Format.Fill.ForeColor.RGB = 3486173
  $null = ($statusChart.HasLegend = $true)

  if ($null -ne $routeMetrics -and (LastRow $routeMetrics) -ge 2) {
    $last = [Math]::Min((LastRow $routeMetrics), 11)
    Add-Chart $dashboard "Requests by Route" $xlBarClustered $routeMetrics.Range("A1:B$last") 356 226 430 250 | Out-Null
  }

  if ($null -ne $runHistory -and (LastRow $runHistory) -ge 2) {
    $last = [Math]::Min((LastRow $runHistory), 9)
    $trendRow = 70
    $dashboard.Cells($trendRow, 10).Value2 = "Generated At"
    $dashboard.Cells($trendRow, 11).Value2 = "Passed"
    $dashboard.Cells($trendRow, 12).Value2 = "Failed"
    $dashboard.Cells($trendRow, 13).Value2 = "P95 ms"
    for ($i = 2; $i -le $last; $i++) {
      $target = $trendRow + $i - 1
      $dashboard.Cells($target, 10).Value2 = [string]$runHistory.Cells($i, 1).Value2
      $dashboard.Cells($target, 11).Value2 = [double](NumberOrZero ($runHistory.Cells($i, 4).Value2))
      $dashboard.Cells($target, 12).Value2 = [double](NumberOrZero ($runHistory.Cells($i, 5).Value2))
      $dashboard.Cells($target, 13).Value2 = [double](NumberOrZero ($runHistory.Cells($i, 10).Value2))
    }
    Add-Chart $dashboard "Run Trend" $xlLineMarkers $dashboard.Range("J70:M$($trendRow + $last - 1)") 804 226 430 250 | Out-Null
  }

  if ($null -ne $testTypeRollup -and (LastRow $testTypeRollup) -ge 2) {
    $outRow = 70
    $dashboard.Cells($outRow, 15).Value2 = "Type"
    $dashboard.Cells($outRow, 16).Value2 = "Passed"
    $dashboard.Cells($outRow, 17).Value2 = "Failed"
    $writeRow = $outRow + 1
    for ($i = 2; $i -le (LastRow $testTypeRollup); $i++) {
      $dashboard.Cells($writeRow, 15).Value2 = [string]$testTypeRollup.Cells($i, 1).Value2
      $dashboard.Cells($writeRow, 16).Value2 = [double](NumberOrZero ($testTypeRollup.Cells($i, 5).Value2))
      $dashboard.Cells($writeRow, 17).Value2 = [double](NumberOrZero ($testTypeRollup.Cells($i, 6).Value2))
      $writeRow++
    }
    if ($writeRow -gt ($outRow + 1)) {
      Add-Chart $dashboard "Tests by Type So Far" $xlColumnClustered $dashboard.Range("O70:Q$($writeRow - 1)") 18 500 390 240 | Out-Null
    }
  }

  if ($null -ne $statusMetrics -and (LastRow $statusMetrics) -ge 2) {
    Add-Chart $dashboard "HTTP Status Distribution" $xlColumnClustered $statusMetrics.Range("A1:B$(LastRow $statusMetrics)") 426 500 330 240 | Out-Null
  }

  if ($null -ne $loadRollup -and (LastRow $loadRollup) -ge 2) {
    $outRow = 70
    $dashboard.Cells($outRow, 22).Value2 = "Load Metric"
    $dashboard.Cells($outRow, 23).Value2 = "Average"
    $dashboard.Cells($outRow, 24).Value2 = "Max"
    $dashboard.Cells($outRow, 25).Value2 = "Threshold"
    $writeRow = $outRow + 1
    $maxLoadRows = [Math]::Min((LastRow $loadRollup), 8)
    for ($i = 2; $i -le $maxLoadRows; $i++) {
      $dashboard.Cells($writeRow, 22).Value2 = [string]$loadRollup.Cells($i, 1).Value2
      $dashboard.Cells($writeRow, 23).Value2 = [double](NumberOrZero ($loadRollup.Cells($i, 5).Value2))
      $dashboard.Cells($writeRow, 24).Value2 = [double](NumberOrZero ($loadRollup.Cells($i, 6).Value2))
      $dashboard.Cells($writeRow, 25).Value2 = [double](NumberOrZero ($loadRollup.Cells($i, 7).Value2))
      $writeRow++
    }
    if ($writeRow -gt ($outRow + 1)) {
      Add-Chart $dashboard "Load Test Overall So Far" $xlBarClustered $dashboard.Range("V70:Y$($writeRow - 1)") 774 500 460 240 | Out-Null
    }
  }

  if ($null -ne $serviceHealth -and (LastRow $serviceHealth) -ge 2) {
    Add-Chart $dashboard "Service Health / Crash Signals" $xlColumnClustered $dashboard.Range("S70:T73") 1252 500 330 240 | Out-Null
  }

  $insight = $dashboard.Range("A41:Z45")
  $insight.Interior.Color = 15921906
  $insight.Font.Color = 1777430
  $null = ($insight.Font.Bold = $true)
  $insight.Cells(1, 1).Value2 = "AI/QA Insights"
  $insight.Cells(2, 1).Value2 = "Scope: $scope | First execution: $firstExecution | Last execution: $lastExecution"
  $insight.Cells(3, 1).Value2 = "Pass rate so far: $passRate | Fail rate so far: $failRate | PR check failures: $prFailureCount | Error rate: $errorRate"
  $insight.Cells(4, 1).Value2 = "Service uptime: $uptimeRate | Latest health: $latestHealthStatus at $latestHealthAt | Payment success/failure: $paymentSuccess/$paymentFailure"

  if ($null -ne $testTypeRollup -and (LastRow $testTypeRollup) -ge 2) {
    $dashboard.Range("A47").Value2 = "Last Execution by Test Type"
    $null = ($dashboard.Range("A47").Font.Bold = $true)
    $testTypeRollup.Range("A1:I1").Copy($dashboard.Range("A48")) | Out-Null
    $testTypeRollup.Range("A2:I$(LastRow $testTypeRollup)").Copy($dashboard.Range("A49")) | Out-Null
    $dashboard.Range("A48:I56").Borders.LineStyle = 1
    $dashboard.Range("A48:I48").Interior.Color = 1777430
    $dashboard.Range("A48:I48").Font.Color = 16777215
  }

  if ($null -ne $prCheckFailures -and (LastRow $prCheckFailures) -ge 2) {
    $dashboard.Range("K47").Value2 = "Recent PR Check Failures"
    $null = ($dashboard.Range("K47").Font.Bold = $true)
    $prCheckFailures.Range("A1:G1").Copy($dashboard.Range("K48")) | Out-Null
    $failureLast = [Math]::Min((LastRow $prCheckFailures), 6)
    $prCheckFailures.Range("A2:G$failureLast").Copy($dashboard.Range("K49")) | Out-Null
    $dashboard.Range("K48:Q54").Borders.LineStyle = 1
    $dashboard.Range("K48:Q48").Interior.Color = 1777430
    $dashboard.Range("K48:Q48").Font.Color = 16777215
  }

  if ($null -ne $requestLogs -and (LastRow $requestLogs) -ge 2) {
    $dashboard.Range("A58").Value2 = "Recent Request Logs"
    $null = ($dashboard.Range("A58").Font.Bold = $true)
    $requestLogs.Range("A1:G1").Copy($dashboard.Range("A59")) | Out-Null
    $recentLast = [Math]::Min((LastRow $requestLogs), 8)
    $requestLogs.Range("A2:G$recentLast").Copy($dashboard.Range("A60")) | Out-Null
    $dashboard.Range("A59:G66").Borders.LineStyle = 1
    $dashboard.Range("A59:G59").Interior.Color = 1777430
    $dashboard.Range("A59:G59").Font.Color = 16777215
  }

  $null = ($dashboard.Range("A70:Z120").EntireRow.Hidden = $true)
  $dashboard.Activate() | Out-Null
  $dashboard.Range("A1").Select() | Out-Null
  $workbook.Save() | Out-Null
}
finally {
  if ($null -ne $workbook) {
    $workbook.Close($true)
    Release-ComObject $workbook
  }
  if ($null -ne $excel) {
    $excel.Quit()
    Release-ComObject $excel
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

Write-Host "Enhanced observability dashboard charts in $resolvedWorkbook"
