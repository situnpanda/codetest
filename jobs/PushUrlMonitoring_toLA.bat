@echo off
REM Simple BAT file to activate venv and run the URL/Service Monitoring ping check.
REM Schedule this to run every 10 minutes via Task Scheduler.

REM Activate the virtual environment
call "D:\ExtractorCodes_AlertTrigger\venv_python313\Scripts\activate.bat"

REM Run the Python script
python "D:\ExtractorCodes_AlertTrigger\Batch Jobs\PushUrlMonitoring_toLA.py"

REM Optional: deactivate after running
call "D:\ExtractorCodes_AlertTrigger\venv_python313\Scripts\deactivate.bat"
