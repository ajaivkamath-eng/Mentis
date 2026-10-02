@echo off
setlocal enabledelayedexpansion

:: Output file name
set "OUTPUT_FILE=combined_output.sql"

:: Clear or create the output file if it already exists
if exist "%OUTPUT_FILE%" del "%OUTPUT_FILE%"

:: Get matching files using findstr regex, sorted alphabetically/numerically
for /f "delims=" %%F in ('dir /b /a-d /o:n ^| findstr /r "^[0-9][0-9][0-9][0-9]_"') do (
    :: Ensure we don't include the output file itself
    if /i not "%%F"=="%OUTPUT_FILE%" (
        echo Appending: %%F
        type "%%F" >> "%OUTPUT_FILE%"
        echo. >> "%OUTPUT_FILE%"
    )
)

echo.
echo Processing complete! Saved to %OUTPUT_FILE%.
pause