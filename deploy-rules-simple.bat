@echo off
echo Deploying Firestore Rules...
firebase deploy --only firestore:rules --non-interactive
echo Done!
pause
