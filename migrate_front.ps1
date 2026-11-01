$ErrorActionPreference = "Stop"

# Корневая папка проекта
$ProjectRoot = (Get-Location).Path

$FrontRoot = Join-Path $ProjectRoot "front"

if (-not (Test-Path -LiteralPath $FrontRoot -PathType Container)) {
    throw "Папка front не найдена. Запусти скрипт из корня проекта."
}


# Новая структура
$Targets = @{
    "html" = Join-Path $FrontRoot "html"
    "css"  = Join-Path $FrontRoot "css"
    "js"   = Join-Path $FrontRoot "js"
    "img"  = Join-Path $FrontRoot "img"
}

$Plan = [System.Collections.Generic.List[object]]::new()


# Перенос HTML из front в front/html
Get-ChildItem -LiteralPath $FrontRoot -File -Filter "*.html" -ErrorAction SilentlyContinue |
    ForEach-Object {

        $Plan.Add([pscustomobject]@{
            Source = $_.FullName
            Destination = Join-Path $Targets["html"] $_.Name
        })

    }


# Перенос CSS из front в front/css
Get-ChildItem -LiteralPath $FrontRoot -File -Filter "*.css" -ErrorAction SilentlyContinue |
    ForEach-Object {

        $Plan.Add([pscustomobject]@{
            Source = $_.FullName
            Destination = Join-Path $Targets["css"] $_.Name
        })

    }


# Перенос JS из front в front/js
Get-ChildItem -LiteralPath $FrontRoot -File -Filter "*.js" -ErrorAction SilentlyContinue |
    ForEach-Object {

        $Plan.Add([pscustomobject]@{
            Source = $_.FullName
            Destination = Join-Path $Targets["js"] $_.Name
        })

    }


# Перенос прежних корневых папок css, js и img
foreach ($FolderName in @("css", "js", "img")) {

    $OldRoot = Join-Path $ProjectRoot $FolderName

    if (Test-Path -LiteralPath $OldRoot -PathType Container) {

        Get-ChildItem -LiteralPath $OldRoot -Recurse -File |
            ForEach-Object {

                $RelativePath = $_.FullName.Substring($OldRoot.Length).TrimStart('\')

                $Destination = Join-Path $Targets[$FolderName] $RelativePath

                $Plan.Add([pscustomobject]@{
                    Source = $_.FullName
                    Destination = $Destination
                })

            }

    }

}


# Проверка конфликтов перед перемещением
$Conflicts = @(
    $Plan | Where-Object {
        Test-Path -LiteralPath $_.Destination
    }
)

if ($Conflicts.Count -gt 0) {

    $ConflictText = $Conflicts |
        ForEach-Object {
            "  $($_.Source) -> $($_.Destination)"
        }

    throw (
        "Найдены файлы с одинаковыми именами. Ничего не перемещено:`n" +
        ($ConflictText -join "`n")
    )

}


# Создание папок
foreach ($Directory in $Targets.Values) {

    New-Item -ItemType Directory -Path $Directory -Force |
        Out-Null

}


# Перемещение файлов
foreach ($Item in $Plan) {

    $DestinationDirectory = Split-Path -Parent $Item.Destination

    New-Item -ItemType Directory -Path $DestinationDirectory -Force |
        Out-Null

    Move-Item `
        -LiteralPath $Item.Source `
        -Destination $Item.Destination

}


# Удаление старых папок, если они полностью пустые
foreach ($FolderName in @("css", "js", "img")) {

    $OldRoot = Join-Path $ProjectRoot $FolderName

    if (
        (Test-Path -LiteralPath $OldRoot -PathType Container) -and
        -not (Get-ChildItem -LiteralPath $OldRoot -Force | Select-Object -First 1)
    ) {

        Remove-Item -LiteralPath $OldRoot

    }

}


Write-Host "Готово. Перемещено файлов: $($Plan.Count)" -ForegroundColor Green

Write-Host "Новая структура:" -ForegroundColor Green
Write-Host "front\html"
Write-Host "front\css"
Write-Host "front\js"
Write-Host "front\img"